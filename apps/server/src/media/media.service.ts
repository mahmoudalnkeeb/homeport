import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { hasPermission, pathAccess, type StreamInfo } from '@homeport/contracts';
import type { Queue } from 'bullmq';
import { eq, inArray, sql } from 'drizzle-orm';

import { InjectDb, type Database } from '../database/database.js';
import { ATTACHMENTS_PREFIX, FILES_PREFIX, STREAMS_PREFIX } from '../storage/storage.keys.js';
import { StorageService } from '../storage/storage.service.js';
import type { Actor } from '../users/users.schema.js';
import { mediaStreams, type MediaStream, type StreamKind } from './media.schema.js';
import { POSTER, type TranscodeResult } from './transcode.js';

export type MediaFile = { type: 'playlist'; body: string } | { type: 'redirect'; url: string };

export const MEDIA_QUEUE = 'media';
export const TRANSCODE_JOB = 'transcode';
export interface TranscodeJob {
  id: string;
}
export type MediaQueue = Pick<Queue<TranscodeJob>, 'add' | 'addBulk'>;

const MAX_ERROR_LENGTH = 500;
const streamPrefix = (id: string) => `${STREAMS_PREFIX}${id}/`;

export function toStreamInfo(row: Pick<MediaStream, 'id' | 'status' | 'duration' | 'hasPoster'>): StreamInfo {
  const ready = row.status === 'ready';
  return {
    id: row.id,
    status: row.status,
    playlist: ready ? `/api/media/${row.id}/master.m3u8` : null,
    poster: ready && row.hasPoster ? `/api/media/${row.id}/${POSTER}` : null,
    duration: row.duration,
  };
}

function canRead(actor: Actor, key: string): boolean {
  if (key.startsWith(FILES_PREFIX)) {
    return hasPermission(actor.role, 'files:read') && pathAccess(actor, key.slice(FILES_PREFIX.length)) !== 'none';
  }
  if (key.startsWith(ATTACHMENTS_PREFIX)) return hasPermission(actor.role, 'attachments:read');
  return false;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    @InjectQueue(MEDIA_QUEUE) private readonly queue: MediaQueue
  ) {}

  async enqueue(sourceKey: string, kind: StreamKind): Promise<StreamInfo> {
    const [row] = await this.db
      .insert(mediaStreams)
      .values({ sourceKey, kind })
      .onConflictDoUpdate({
        target: mediaStreams.sourceKey,
        set: { kind, status: 'pending', attempts: 0, error: null, hasPoster: false, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new Error('Insert returned no row');
    await this.queue.add(TRANSCODE_JOB, { id: row.id }, { jobId: row.id });
    return toStreamInfo(row);
  }

  async streamsFor(keys: string[]): Promise<Map<string, StreamInfo>> {
    if (!keys.length) return new Map();
    const rows = await this.db.select().from(mediaStreams).where(inArray(mediaStreams.sourceKey, keys));
    return new Map(rows.map((row) => [row.sourceKey, toStreamInfo(row)]));
  }

  async forget(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const rows = await this.db.delete(mediaStreams).where(inArray(mediaStreams.sourceKey, keys)).returning({ id: mediaStreams.id });
    await Promise.all(rows.map((row) => this.storage.removePrefix(streamPrefix(row.id))));
  }

  async forgetPrefix(prefix: string): Promise<void> {
    const rows = await this.db
      .delete(mediaStreams)
      .where(sql`starts_with(${mediaStreams.sourceKey}, ${prefix})`)
      .returning({ id: mediaStreams.id });
    await Promise.all(rows.map((row) => this.storage.removePrefix(streamPrefix(row.id))));
  }

  async move(from: string, to: string): Promise<void> {
    await this.db.update(mediaStreams).set({ sourceKey: to }).where(eq(mediaStreams.sourceKey, from));
  }

  async movePrefix(from: string, to: string): Promise<void> {
    await this.db
      .update(mediaStreams)
      .set({ sourceKey: sql`${to} || substr(${mediaStreams.sourceKey}, ${from.length + 1})` })
      .where(sql`starts_with(${mediaStreams.sourceKey}, ${from})`);
  }

  async requeueUnfinished(): Promise<number> {
    const rows = await this.db
      .update(mediaStreams)
      .set({ status: 'pending' })
      .where(inArray(mediaStreams.status, ['pending', 'processing']))
      .returning({ id: mediaStreams.id });
    if (!rows.length) return 0;
    await this.queue.addBulk(rows.map(({ id }) => ({ name: TRANSCODE_JOB, data: { id }, opts: { jobId: id } })));
    return rows.length;
  }

  async start(id: string): Promise<MediaStream | undefined> {
    const [row] = await this.db
      .update(mediaStreams)
      .set({ status: 'processing', attempts: sql`${mediaStreams.attempts} + 1`, error: null, updatedAt: new Date() })
      .where(eq(mediaStreams.id, id))
      .returning();
    return row;
  }

  async complete(id: string, result: TranscodeResult): Promise<boolean> {
    const rows = await this.db
      .update(mediaStreams)
      .set({ status: 'ready', duration: result.duration, hasPoster: result.hasPoster, error: null, updatedAt: new Date() })
      .where(eq(mediaStreams.id, id))
      .returning({ id: mediaStreams.id });
    if (rows.length) return true;
    await this.storage.removePrefix(streamPrefix(id));
    return false;
  }

  async fail(id: string, message: string): Promise<void> {
    await this.db
      .update(mediaStreams)
      .set({ status: 'failed', error: message.slice(0, MAX_ERROR_LENGTH), updatedAt: new Date() })
      .where(eq(mediaStreams.id, id));
  }

  async file(actor: Actor, host: string, id: string, file: string): Promise<MediaFile> {
    const [row] = await this.db.select().from(mediaStreams).where(eq(mediaStreams.id, id));
    if (!row || row.status !== 'ready' || !canRead(actor, row.sourceKey)) throw new NotFoundException('Stream not found');
    const prefix = streamPrefix(id);

    if (file === POSTER) {
      if (!row.hasPoster) throw new NotFoundException('Stream has no poster');
      return { type: 'redirect', url: await this.storage.signedUrl(host, `${prefix}${POSTER}`, { contentType: 'image/jpeg', disposition: 'inline' }) };
    }
    if (file === 'master.m3u8') {
      const master = await this.storage.readText(`${prefix}master.m3u8`);
      return { type: 'playlist', body: master.replace(/^(v\d+)\/index\.m3u8$/gm, '$1.m3u8') };
    }
    const variant = file.replace(/\.m3u8$/, '');
    const playlist = await this.storage.readText(`${prefix}${variant}/index.m3u8`);
    const lines = await Promise.all(
      playlist.split('\n').map((line) => {
        const segment = line.trim();
        if (!segment || segment.startsWith('#')) return line;
        return this.storage.signedUrl(host, `${prefix}${variant}/${segment}`, { contentType: 'video/mp2t', disposition: 'inline' });
      })
    );
    return { type: 'playlist', body: lines.join('\n') };
  }
}
