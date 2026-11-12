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

import { ActivityService } from '../../activity/activity.service.js';
import { ENV, type Environment } from '../../config/env.js';

export type FileKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'markdown'
  | 'text'
  | 'archive'
  | 'other';

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

export interface FileEntry {
  name: string;
  path: string;
  kind: FileKind;
  size: number;
  modified: string;
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

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error ? String(error.code) : undefined;
}

export function assertValidName(name: string): void {
  if (!name || name === '.' || name === '..' || name.length > 255 || INVALID_NAME.test(name) || hasControlChars(name)) {
    throw new BadRequestException(`Invalid name: ${name}`);
  }
}

@Injectable()
export class FilesService implements OnModuleInit {
  private statsCache: { at: number; value: StorageStats; files: FileEntry[] } | undefined;

  constructor(
    @Inject(ENV) private readonly env: Environment,
    private readonly activity: ActivityService
  ) {}

  get root(): string {
    return this.env.DATA_DIR;
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  /** Resolves a client path inside the data root, rejecting traversal and symlink escapes. */
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

  private async statOrThrow(absolute: string) {
    try {
      return await stat(absolute);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') throw new NotFoundException('Not found');
      throw error;
    }
  }

  private changed(action: string, detail: string): void {
    this.statsCache = undefined;
    this.activity.record('files', action, detail);
  }

  async list(path: string): Promise<{ path: string; entries: FileEntry[] }> {
    const absolute = await this.resolve(path);
    if (!(await this.statOrThrow(absolute)).isDirectory()) {
      throw new BadRequestException('Not a folder');
    }
    const dirents = await readdir(absolute, { withFileTypes: true });
    const entries = await Promise.all(
      dirents
        .filter((dirent) => !isHidden(dirent.name))
        .map(async (dirent): Promise<FileEntry | null> => {
          const child = join(absolute, dirent.name);
          try {
            const info = await stat(child);
            return {
              name: dirent.name,
              path: this.toRelative(child),
              kind: info.isDirectory() ? 'folder' : kindOf(dirent.name),
              size: info.isDirectory() ? 0 : info.size,
              modified: info.mtime.toISOString(),
            };
          } catch {
            return null; // broken symlink or file removed mid-listing
          }
        })
    );
    return {
      path: this.toRelative(absolute),
      entries: entries
        .filter((entry) => entry !== null)
        .sort(
          (a, b) =>
            Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
            a.name.localeCompare(b.name, undefined, { numeric: true })
        ),
    };
  }

  async file(path: string): Promise<{ absolute: string; name: string }> {
    const absolute = await this.resolve(path);
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

  async upload(path: string, files: { originalname: string; path: string }[]): Promise<FileEntry[]> {
    try {
      const folder = await this.resolve(path);
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
      this.changed('upload', saved.map((entry) => entry.path).join(', '));
      return saved;
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

  async writeText(path: string, content: string): Promise<FileEntry> {
    const absolute = await this.resolve(path);
    assertValidName(basename(absolute));
    if (!['markdown', 'text'].includes(kindOf(absolute))) {
      throw new BadRequestException('Only text and markdown files can be written');
    }
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content, 'utf8');
    const info = await stat(absolute);
    this.changed('save', this.toRelative(absolute));
    return {
      name: basename(absolute),
      path: this.toRelative(absolute),
      kind: kindOf(absolute),
      size: info.size,
      modified: info.mtime.toISOString(),
    };
  }

  async createFolder(path: string): Promise<void> {
    const absolute = await this.resolve(path);
    assertValidName(basename(absolute));
    await mkdir(absolute, { recursive: true });
    this.changed('mkdir', this.toRelative(absolute));
  }

  async rename(path: string, name: string): Promise<string> {
    assertValidName(name);
    const absolute = await this.resolve(path);
    if (absolute === this.root) throw new BadRequestException('Cannot rename the root folder');
    await this.statOrThrow(absolute);
    const target = join(absolute, '..', name);
    try {
      await stat(target);
      throw new ConflictException(`${name} already exists`);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    await rename(absolute, target);
    this.changed('rename', `${this.toRelative(absolute)} → ${name}`);
    return this.toRelative(target);
  }

  async remove(path: string): Promise<void> {
    const absolute = await this.resolve(path);
    if (absolute === this.root) throw new BadRequestException('Cannot delete the root folder');
    await this.statOrThrow(absolute);
    await rm(absolute, { recursive: true });
    this.changed('delete', this.toRelative(absolute));
  }

  async stats(): Promise<StorageStats> {
    return (await this.scan()).value;
  }

  async recent(kind: FileKind, limit: number): Promise<{ count: number; files: FileEntry[] }> {
    const matching = (await this.scan()).files.filter((file) => file.kind === kind);
    return { count: matching.length, files: matching.slice(0, limit) };
  }

  private async scan() {
    if (this.statsCache && Date.now() - this.statsCache.at < STATS_TTL_MS) return this.statsCache;
    const byKind = new Map<FileKind, { bytes: number; count: number }>();
    const files: FileEntry[] = [];
    let folders = 0;
    let totalBytes = 0;

    for (const dirent of await readdir(this.root, { withFileTypes: true, recursive: true })) {
      const absolute = join(dirent.parentPath, dirent.name);
      if (this.toRelative(absolute).split('/').some(isHidden)) continue;
      if (dirent.isDirectory()) {
        folders++;
        continue;
      }
      if (!dirent.isFile()) continue;
      const info = await stat(absolute).catch(() => null);
      if (!info) continue;
      const kind = kindOf(dirent.name);
      const bucket = byKind.get(kind) ?? { bytes: 0, count: 0 };
      bucket.bytes += info.size;
      bucket.count++;
      byKind.set(kind, bucket);
      totalBytes += info.size;
      files.push({
        name: dirent.name,
        path: this.toRelative(absolute),
        kind,
        size: info.size,
        modified: info.mtime.toISOString(),
      });
    }

    files.sort((a, b) => b.modified.localeCompare(a.modified));
    const value: StorageStats = {
      totalBytes,
      files: files.length,
      folders,
      byKind: [...byKind]
        .map(([kind, bucket]) => ({ kind, ...bucket }))
        .sort((a, b) => b.bytes - a.bytes),
      recent: files.slice(0, 8),
    };
    this.statsCache = { at: Date.now(), value, files };
    return this.statsCache;
  }
}
