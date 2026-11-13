import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  homeOf,
  hasPermission,
  isStreamable,
  kindOf,
  pathAccess,
  USERS_FOLDER,
  type FileEntry,
  type FileKind,
  type FileUploadStartBody,
  type PathAccess,
  type RecentScope,
  type RenameResult,
  type ToolSummary,
  type UploadFinishBody,
  type UploadTicket,
} from '@homeport/contracts';

import { ActivityService } from '../../activity/activity.service.js';
import { Paginated } from '../../common/http/pagination.js';
import { MediaService } from '../../media/media.service.js';
import { assertValidName, contentTypeOf, FILES_PREFIX } from '../../storage/storage.keys.js';
import { StorageService } from '../../storage/storage.service.js';
import type { Actor } from '../../users/users.schema.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { formatBytes } from '../format.js';
import type { FolderQueryDto, RecentQueryDto } from './files.dto.js';

export interface StorageStats {
  totalBytes: number;
  files: number;
  folders: number;
  byKind: { kind: FileKind; bytes: number; count: number }[];
  recent: FileEntry[];
}

interface Scan {
  at: number;
  files: FileEntry[];
  folders: Map<string, string>;
}

const STATS_TTL_MS = 30_000;
const RESERVATION_MS = 12 * 3_600_000;

const isHidden = (name: string) => name.startsWith('.');
const isWithin = (path: string, folder: string) => folder === '' || path === folder || path.startsWith(`${folder}/`);
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
const nameOf = (path: string) => path.split('/').pop() ?? '';
const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
const keyOf = (path: string) => `${FILES_PREFIX}${path}`;
const folderKey = (path: string) => (path ? `${FILES_PREFIX}${path}/` : FILES_PREFIX);

export function normalizePath(path: string): string {
  const parts = path.split(/[/\\]+/).filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) throw new BadRequestException('Invalid path');
  return parts.join('/');
}

const fileHref = (file: FileEntry) => `/tools/files?path=${encodeURIComponent(parentOf(file.path))}&open=${encodeURIComponent(file.path)}`;

function toSummary(stats: StorageStats, scopeLabel: string): ToolSummary {
  return {
    tiles: [
      { label: scopeLabel, value: formatBytes(stats.totalBytes) },
      { label: 'Files', value: stats.files.toLocaleString('en') },
      { label: 'Folders', value: stats.folders.toLocaleString('en') },
    ],
    breakdown: stats.byKind.map(({ kind, bytes, count }) => ({ label: kind, value: bytes, display: `${formatBytes(bytes)} · ${count}` })),
    recent: stats.recent.map((file) => ({ label: file.name, href: fileHref(file), size: file.size, modified: file.modified })),
  };
}

function summarize(files: FileEntry[], folders: number): StorageStats {
  const byKind = new Map<FileKind, { bytes: number; count: number }>();
  let totalBytes = 0;
  for (const file of files) {
    const bucket = byKind.get(file.kind) ?? { bytes: 0, count: 0 };
    bucket.bytes += file.size;
    bucket.count++;
    byKind.set(file.kind, bucket);
    totalBytes += file.size;
  }
  return {
    totalBytes,
    files: files.length,
    folders,
    byKind: [...byKind].map(([kind, bucket]) => ({ kind, ...bucket })).sort((a, b) => b.bytes - a.bytes),
    recent: files.slice(0, 8),
  };
}

@Injectable()
export class FilesService implements OnModuleInit {
  private scanCache: Scan | undefined;
  private readonly reserved = new Map<string, number>();

  constructor(
    private readonly storage: StorageService,
    private readonly media: MediaService,
    private readonly activity: ActivityService,
    private readonly attachments: AttachmentsService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.storage.put(folderKey(USERS_FOLDER), '', 'application/x-directory');
  }

  private authorize(actor: Actor, path: string, needed: Exclude<PathAccess, 'none'>): string {
    const rel = normalizePath(path);
    const access = pathAccess(actor, rel);
    if (access === 'none') throw new NotFoundException('Not found');
    if (needed === 'write' && access !== 'write') throw new ForbiddenException('This location is read-only for you');
    return rel;
  }

  private assertNotStructural(rel: string): void {
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) throw new BadRequestException('Cannot change the library root');
    if (parts[0] === USERS_FOLDER && parts.length <= 2) {
      throw new BadRequestException('Personal spaces are managed from the Users page');
    }
  }

  private async changed(actor: Actor, action: string, detail: string): Promise<void> {
    this.scanCache = undefined;
    await this.activity.record('files', action, detail, actor.username);
  }

  private async exists(path: string): Promise<boolean> {
    return (await this.storage.head(keyOf(path))) !== null || (await this.storage.any(folderKey(path)));
  }

  async ensureHome(username: string): Promise<void> {
    const home = homeOf(username);
    if ((await this.scan()).folders.has(home)) return;
    await this.storage.put(folderKey(home), '', 'application/x-directory');
    this.scanCache = undefined;
  }

  async removeHome(username: string): Promise<void> {
    const prefix = folderKey(homeOf(username));
    await this.storage.removePrefix(prefix);
    await this.media.forgetPrefix(prefix);
    await this.attachments.forgetPrefix(prefix);
    this.scanCache = undefined;
  }

  async list(actor: Actor, { path = '', ...page }: FolderQueryDto): Promise<Paginated<FileEntry>> {
    const rel = this.authorize(actor, path, 'read');
    if (rel === homeOf(actor.username)) await this.ensureHome(actor.username);
    const scan = await this.scan();
    if (rel && !scan.folders.has(rel)) {
      if (scan.files.some((file) => file.path === rel)) throw new BadRequestException('Not a folder');
      throw new NotFoundException('Not found');
    }
    const folders: FileEntry[] = [...scan.folders]
      .filter(([folder]) => folder && parentOf(folder) === rel)
      .map(([folder, modified]) => ({ name: nameOf(folder), path: folder, kind: 'folder', size: 0, modified }));
    const files = scan.files.filter((file) => parentOf(file.path) === rel);
    const visible = [...folders, ...files]
      .filter((entry) => pathAccess(actor, entry.path) !== 'none')
      .sort(
        (a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, undefined, { numeric: true })
      );
    const streams = await this.media.streamsFor(visible.filter((entry) => isStreamable(entry.kind)).map((entry) => keyOf(entry.path)));
    return Paginated.slice(
      visible.map((entry) => (isStreamable(entry.kind) ? { ...entry, stream: streams.get(keyOf(entry.path)) ?? null } : entry)),
      page
    );
  }

  async file(actor: Actor, path: string): Promise<{ key: string; name: string }> {
    const rel = this.authorize(actor, path, 'read');
    if (!rel || !(await this.storage.head(keyOf(rel)))) throw new NotFoundException('Not found');
    return { key: keyOf(rel), name: nameOf(rel) };
  }

  private async uniquePath(folder: string, name: string): Promise<string> {
    const now = Date.now();
    for (const [path, expires] of this.reserved) if (expires < now) this.reserved.delete(path);
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    for (let i = 0; ; i++) {
      const candidate = joinPath(folder, i === 0 ? name : `${stem} (${i})${ext}`);
      if (this.reserved.has(candidate) || (await this.exists(candidate))) continue;
      this.reserved.set(candidate, now + RESERVATION_MS);
      return candidate;
    }
  }

  async startUpload(actor: Actor, host: string, { folder = '', name, size }: FileUploadStartBody): Promise<UploadTicket> {
    assertValidName(name);
    const dir = this.authorize(actor, folder, 'write');
    const path = await this.uniquePath(dir, name);
    const contentType = contentTypeOf(name);
    try {
      return { target: path, contentType, ...(await this.storage.startUpload(host, keyOf(path), size, contentType)) };
    } catch (error) {
      this.reserved.delete(path);
      throw error;
    }
  }

  async finishUpload(actor: Actor, { target, uploadId }: UploadFinishBody): Promise<FileEntry> {
    const path = this.authorize(actor, target, 'write');
    assertValidName(nameOf(path));
    const object = await this.storage.finishUpload(keyOf(path), uploadId);
    this.reserved.delete(path);
    await this.attachments.track(actor, keyOf(path), object.size);
    const kind = kindOf(path);
    const stream = isStreamable(kind) ? await this.media.enqueue(keyOf(path), kind) : null;
    await this.changed(actor, 'upload', path);
    return { name: nameOf(path), path, kind, size: object.size, modified: object.modified.toISOString(), stream };
  }

  async abortUpload(actor: Actor, { target, uploadId }: UploadFinishBody): Promise<void> {
    const path = this.authorize(actor, target, 'write');
    await this.storage.abortUpload(keyOf(path), uploadId);
    this.reserved.delete(path);
  }

  async writeText(actor: Actor, path: string, content: string): Promise<FileEntry> {
    const rel = this.authorize(actor, path, 'write');
    const name = nameOf(rel);
    assertValidName(name);
    const kind = kindOf(name);
    if (kind !== 'markdown' && kind !== 'text') throw new BadRequestException('Only text and markdown files can be written');
    await this.storage.put(keyOf(rel), content, contentTypeOf(name));
    await this.attachments.resize(keyOf(rel), Buffer.byteLength(content));
    await this.changed(actor, 'save', rel);
    return { name, path: rel, kind, size: Buffer.byteLength(content), modified: new Date().toISOString() };
  }

  async createFolder(actor: Actor, path: string): Promise<void> {
    const rel = this.authorize(actor, path, 'write');
    assertValidName(nameOf(rel));
    await this.storage.put(folderKey(rel), '', 'application/x-directory');
    await this.changed(actor, 'mkdir', rel);
  }

  async rename(actor: Actor, path: string, name: string): Promise<RenameResult> {
    assertValidName(name);
    const rel = this.authorize(actor, path, 'write');
    this.assertNotStructural(rel);
    const target = joinPath(parentOf(rel), name);
    const file = await this.storage.head(keyOf(rel));
    const objects = file ? [file] : await this.storage.list(folderKey(rel));
    if (!objects.length) throw new NotFoundException('Not found');
    if (await this.exists(target)) throw new ConflictException(`${name} already exists`);

    if (file) {
      await this.storage.move(file, keyOf(target));
      await this.media.move(keyOf(rel), keyOf(target));
      await this.attachments.move(keyOf(rel), keyOf(target));
    } else {
      const [from, to] = [folderKey(rel), folderKey(target)];
      for (const object of objects) await this.storage.move(object, `${to}${object.key.slice(from.length)}`);
      await this.media.movePrefix(from, to);
      await this.attachments.movePrefix(from, to);
    }
    await this.changed(actor, 'rename', `${rel} → ${name}`);
    return { path: target };
  }

  async remove(actor: Actor, path: string): Promise<void> {
    const rel = this.authorize(actor, path, 'write');
    this.assertNotStructural(rel);
    if (await this.storage.head(keyOf(rel))) {
      await this.storage.remove([keyOf(rel)]);
      await this.media.forget([keyOf(rel)]);
      await this.attachments.forget([keyOf(rel)]);
    } else {
      const prefix = folderKey(rel);
      if (!(await this.storage.any(prefix))) throw new NotFoundException('Not found');
      await this.storage.removePrefix(prefix);
      await this.media.forgetPrefix(prefix);
      await this.attachments.forgetPrefix(prefix);
    }
    await this.changed(actor, 'delete', rel);
  }

  async stats(): Promise<StorageStats> {
    const scan = await this.scan();
    return summarize(scan.files, scan.folders.size);
  }

  async homeStats(username: string): Promise<StorageStats> {
    const scan = await this.scan();
    const home = homeOf(username);
    return summarize(
      scan.files.filter((file) => isWithin(file.path, home)),
      [...scan.folders.keys()].filter((folder) => isWithin(folder, home) && folder !== home).length
    );
  }

  async homeBytes(): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    for (const file of (await this.scan()).files) {
      const [first, owner] = file.path.split('/');
      if (first === USERS_FOLDER && owner) totals.set(owner, (totals.get(owner) ?? 0) + file.size);
    }
    return totals;
  }

  async recent(actor: Actor, { scope = 'all', kind, ...page }: RecentQueryDto): Promise<Paginated<FileEntry>> {
    return Paginated.slice(await this.recentFiles(actor, scope, kind), page);
  }

  async recentFiles(actor: Actor, scope: RecentScope, kind?: FileKind): Promise<FileEntry[]> {
    const home = homeOf(actor.username);
    const inScope = (path: string) => {
      if (scope === 'home') return isWithin(path, home);
      if (scope === 'library') return !isWithin(path, USERS_FOLDER) && pathAccess(actor, path) !== 'none';
      return pathAccess(actor, path) !== 'none';
    };
    return (await this.scan()).files.filter((file) => (!kind || file.kind === kind) && inScope(file.path));
  }

  async summary(actor: Actor): Promise<ToolSummary> {
    if (hasPermission(actor.role, 'system:read')) return toSummary(await this.stats(), 'Stored');
    await this.ensureHome(actor.username);
    return toSummary(await this.homeStats(actor.username), 'In my space');
  }

  private async scan(): Promise<Scan> {
    if (this.scanCache && Date.now() - this.scanCache.at < STATS_TTL_MS) return this.scanCache;
    const files: FileEntry[] = [];
    const folders = new Map<string, string>();
    const touch = (folder: string, modified: string) => {
      const parts = folder.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        const ancestor = parts.slice(0, i).join('/');
        const current = folders.get(ancestor);
        if (!current || current < modified) folders.set(ancestor, modified);
      }
    };

    for (const object of await this.storage.list(FILES_PREFIX)) {
      const rel = object.key.slice(FILES_PREFIX.length);
      const isFolder = rel.endsWith('/');
      const path = isFolder ? rel.slice(0, -1) : rel;
      if (!path || path.split('/').some(isHidden)) continue;
      const modified = object.modified.toISOString();
      if (isFolder) {
        touch(path, modified);
        continue;
      }
      touch(parentOf(path), modified);
      files.push({ name: nameOf(path), path, kind: kindOf(path), size: object.size, modified });
    }

    files.sort((a, b) => b.modified.localeCompare(a.modified));
    this.scanCache = { at: Date.now(), files, folders };
    return this.scanCache;
  }
}
