import { copyFile, mkdir, readdir, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  homeOf,
  pathAccess,
  USERS_FOLDER,
  hasPermission,
  type FileEntry,
  type FileKind,
  type PathAccess,
  type RecentScope,
  type RenameResult,
  type ToolSummary,
} from '@homelab/contracts';

import { ActivityService } from '../../activity/activity.service.js';
import { Paginated } from '../../common/http/pagination.js';
import { ENV, type Environment } from '../../config/env.js';
import type { Actor } from '../../users/users.schema.js';
import { formatBytes } from '../format.js';
import type { FolderQueryDto, RecentQueryDto } from './files.dto.js';

const EXTENSIONS: Record<Exclude<FileKind, 'folder' | 'other'>, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'],
  video: ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus'],
  pdf: ['pdf'],
  markdown: ['md', 'markdown', 'mdx'],
  text: ['txt', 'log', 'json', 'csv', 'yml', 'yaml', 'xml', 'ini', 'conf', 'env', 'ts', 'js', 'css', 'html', 'sh', 'py'],
  archive: ['zip', 'tar', 'gz', 'tgz', '7z', 'rar'],
};

const KIND_BY_EXTENSION = new Map(
  Object.entries(EXTENSIONS).flatMap(([kind, exts]) => exts.map((ext) => [ext, kind as FileKind]))
);

export function kindOf(name: string): FileKind {
  return KIND_BY_EXTENSION.get(extname(name).slice(1).toLowerCase()) ?? 'other';
}

export interface StorageStats {
  totalBytes: number;
  files: number;
  folders: number;
  byKind: { kind: FileKind; bytes: number; count: number }[];
  recent: FileEntry[];
}

const INVALID_NAME = /[<>:"/\\|?*]/;
const hasControlChars = (name: string) => [...name].some((char) => char.charCodeAt(0) < 32);
const STATS_TTL_MS = 30_000;

const isHidden = (name: string) => name.startsWith('.');
const toPosix = (path: string) => path.split(sep).join('/');
const isWithin = (path: string, folder: string) => folder === '' || path === folder || path.startsWith(`${folder}/`);

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error ? String(error.code) : undefined;
}

export function assertValidName(name: string): void {
  if (!name || name === '.' || name === '..' || name.length > 255 || INVALID_NAME.test(name) || hasControlChars(name)) {
    throw new BadRequestException(`Invalid name: ${name}`);
  }
}

const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');
const fileHref = (file: FileEntry) =>
  `/tools/files?path=${encodeURIComponent(folderOf(file.path))}&open=${encodeURIComponent(file.path)}`;

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

interface Scan {
  at: number;
  files: FileEntry[];
  folders: string[];
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

  constructor(
    @Inject(ENV) private readonly env: Environment,
    private readonly activity: ActivityService
  ) {}

  get root(): string {
    return this.env.DATA_DIR;
  }

  async onModuleInit(): Promise<void> {
    await mkdir(join(this.root, USERS_FOLDER), { recursive: true });
  }

  async resolve(path: string): Promise<string> {
    const absolute = resolve(this.root, `.${sep}${path}`);
    this.assertInsideRoot(absolute);
    try {
      this.assertInsideRoot(await realpath(absolute), await realpath(this.root));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    return absolute;
  }

  private assertInsideRoot(absolute: string, root = this.root): void {
    if (absolute !== root && !absolute.startsWith(root + sep)) {
      throw new ForbiddenException('Path is outside the data directory');
    }
  }

  private toRelative(absolute: string): string {
    return toPosix(relative(this.root, absolute));
  }

  private async authorize(actor: Actor, path: string, needed: Exclude<PathAccess, 'none'>) {
    const absolute = await this.resolve(path);
    const rel = this.toRelative(absolute);
    const access = pathAccess(actor, rel);
    if (access === 'none') throw new NotFoundException('Not found');
    if (needed === 'write' && access !== 'write') throw new ForbiddenException('This location is read-only for you');
    return { absolute, rel, access };
  }

  private assertNotStructural(rel: string): void {
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) throw new BadRequestException('Cannot change the data folder itself');
    if (parts[0] === USERS_FOLDER && parts.length <= 2) {
      throw new BadRequestException('Personal spaces are managed from the Users page');
    }
  }

  private async statOrThrow(absolute: string) {
    try {
      return await stat(absolute);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') throw new NotFoundException('Not found');
      throw error;
    }
  }

  private async changed(actor: Actor, action: string, detail: string): Promise<void> {
    this.scanCache = undefined;
    await this.activity.record('files', action, detail, actor.username);
  }

  async ensureHome(username: string): Promise<void> {
    await mkdir(join(this.root, USERS_FOLDER, username), { recursive: true });
  }

  async removeHome(username: string): Promise<void> {
    await rm(join(this.root, USERS_FOLDER, username), { recursive: true, force: true });
    this.scanCache = undefined;
  }

  async list(actor: Actor, { path = '', ...page }: FolderQueryDto): Promise<Paginated<FileEntry>> {
    if (path.replace(/^\/+|\/+$/g, '') === homeOf(actor.username)) await this.ensureHome(actor.username);
    const { absolute } = await this.authorize(actor, path, 'read');
    if (!(await this.statOrThrow(absolute)).isDirectory()) {
      throw new BadRequestException('Not a folder');
    }
    const dirents = await readdir(absolute, { withFileTypes: true });
    const entries = await Promise.all(
      dirents
        .filter((dirent) => !isHidden(dirent.name))
        .map(async (dirent): Promise<FileEntry | null> => {
          const child = join(absolute, dirent.name);
          const childRel = this.toRelative(child);
          if (pathAccess(actor, childRel) === 'none') return null;
          try {
            const info = await stat(child);
            return {
              name: dirent.name,
              path: childRel,
              kind: info.isDirectory() ? 'folder' : kindOf(dirent.name),
              size: info.isDirectory() ? 0 : info.size,
              modified: info.mtime.toISOString(),
            };
          } catch {
            return null;
          }
        })
    );
    const sorted = entries
      .filter((entry) => entry !== null)
      .sort(
        (a, b) =>
          Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, undefined, { numeric: true })
      );
    return Paginated.slice(sorted, page);
  }

  async file(actor: Actor, path: string): Promise<{ absolute: string; name: string }> {
    const { absolute } = await this.authorize(actor, path, 'read');
    if (!(await this.statOrThrow(absolute)).isFile()) throw new BadRequestException('Not a file');
    return { absolute, name: basename(absolute) };
  }

  private async uniqueTarget(folder: string, name: string): Promise<string> {
    const ext = extname(name);
    const stem = name.slice(0, name.length - ext.length);
    for (let i = 0; ; i++) {
      const candidate = join(folder, i === 0 ? name : `${stem} (${i})${ext}`);
      try {
        await stat(candidate);
      } catch {
        return candidate;
      }
    }
  }

  async upload(actor: Actor, path: string, files: { originalname: string; path: string }[]): Promise<Paginated<FileEntry>> {
    try {
      const { absolute: folder } = await this.authorize(actor, path, 'write');
      await mkdir(folder, { recursive: true });
      const saved: FileEntry[] = [];
      for (const file of files) {
        const name = basename(file.originalname);
        assertValidName(name);
        const target = await this.uniqueTarget(folder, name);
        await this.move(file.path, target);
        const info = await stat(target);
        saved.push({
          name: basename(target),
          path: this.toRelative(target),
          kind: kindOf(target),
          size: info.size,
          modified: info.mtime.toISOString(),
        });
      }
      await this.changed(actor, 'upload', saved.map((entry) => entry.path).join(', '));
      return Paginated.all(saved);
    } finally {
      await Promise.all(files.map((file) => rm(file.path, { force: true })));
    }
  }

  private async move(from: string, to: string): Promise<void> {
    try {
      await rename(from, to);
    } catch (error) {
      if (errorCode(error) !== 'EXDEV') throw error;
      await copyFile(from, to);
      await unlink(from);
    }
  }

  async writeText(actor: Actor, path: string, content: string): Promise<FileEntry> {
    const { absolute, rel } = await this.authorize(actor, path, 'write');
    assertValidName(basename(absolute));
    if (!['markdown', 'text'].includes(kindOf(absolute))) {
      throw new BadRequestException('Only text and markdown files can be written');
    }
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content, 'utf8');
    const info = await stat(absolute);
    await this.changed(actor, 'save', rel);
    return { name: basename(absolute), path: rel, kind: kindOf(absolute), size: info.size, modified: info.mtime.toISOString() };
  }

  async createFolder(actor: Actor, path: string): Promise<void> {
    const { absolute, rel } = await this.authorize(actor, path, 'write');
    assertValidName(basename(absolute));
    await mkdir(absolute, { recursive: true });
    await this.changed(actor, 'mkdir', rel);
  }

  async rename(actor: Actor, path: string, name: string): Promise<RenameResult> {
    assertValidName(name);
    const { absolute, rel } = await this.authorize(actor, path, 'write');
    this.assertNotStructural(rel);
    await this.statOrThrow(absolute);
    const target = join(absolute, '..', name);
    try {
      await stat(target);
      throw new ConflictException(`${name} already exists`);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    await rename(absolute, target);
    await this.changed(actor, 'rename', `${rel} → ${name}`);
    return { path: this.toRelative(target) };
  }

  async remove(actor: Actor, path: string): Promise<void> {
    const { absolute, rel } = await this.authorize(actor, path, 'write');
    this.assertNotStructural(rel);
    await this.statOrThrow(absolute);
    await rm(absolute, { recursive: true });
    await this.changed(actor, 'delete', rel);
  }

  async stats(): Promise<StorageStats> {
    const scan = await this.scan();
    return summarize(scan.files, scan.folders.length);
  }

  async homeStats(username: string): Promise<StorageStats> {
    const scan = await this.scan();
    const home = homeOf(username);
    return summarize(
      scan.files.filter((file) => isWithin(file.path, home)),
      scan.folders.filter((folder) => isWithin(folder, home) && folder !== home).length
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
    const folders: string[] = [];

    for (const dirent of await readdir(this.root, { withFileTypes: true, recursive: true })) {
      const absolute = join(dirent.parentPath, dirent.name);
      const rel = this.toRelative(absolute);
      if (rel.split('/').some(isHidden)) continue;
      if (dirent.isDirectory()) {
        folders.push(rel);
        continue;
      }
      if (!dirent.isFile()) continue;
      const info = await stat(absolute).catch(() => null);
      if (!info) continue;
      files.push({ name: dirent.name, path: rel, kind: kindOf(dirent.name), size: info.size, modified: info.mtime.toISOString() });
    }

    files.sort((a, b) => b.modified.localeCompare(a.modified));
    this.scanCache = { at: Date.now(), files, folders };
    return this.scanCache;
  }
}
