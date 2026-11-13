import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/database/database.js';
import { MediaService } from '../src/media/media.service.js';
import { transcode, videoRenditions } from '../src/media/transcode.js';
import type { Actor } from '../src/users/users.schema.js';
import { MemoryStorage } from './memory-storage.js';
import { createTestDatabase } from './support.js';

const admin: Actor = { id: 'admin-id', username: 'admin', role: 'admin' };
const bob: Actor = { id: 'bob-id', username: 'bob', role: 'member' };

describe('videoRenditions', () => {
  it('builds a ladder up to the source resolution, never upscaling', () => {
    expect(videoRenditions(1920, 1080)).toEqual([
      { width: 1920, height: 1080, kbps: 5000 },
      { width: 1280, height: 720, kbps: 2800 },
      { width: 854, height: 480, kbps: 1400 },
      { width: 640, height: 360, kbps: 800 },
    ]);
    expect(videoRenditions(3840, 2160)[0]).toEqual({ width: 1920, height: 1080, kbps: 5000 });
    expect(videoRenditions(640, 360)).toEqual([{ width: 640, height: 360, kbps: 800 }]);
  });

  it('scales portrait video by its short side and keeps tiny sources as they are', () => {
    expect(videoRenditions(1080, 1920).map(({ width, height }) => [width, height])).toEqual([
      [1080, 1920],
      [720, 1280],
      [480, 854],
      [360, 640],
    ]);
    expect(videoRenditions(320, 240)).toEqual([{ width: 320, height: 240, kbps: 800 }]);
  });
});

describe('MediaService', () => {
  let storage: MemoryStorage;
  let media: MediaService;
  let db: Database;
  let closeDb: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close: closeDb } = await createTestDatabase());
    storage = new MemoryStorage();
    media = new MediaService(db, storage);
  });

  afterEach(() => closeDb());

  const ready = async (sourceKey: string) => {
    const { id } = await media.enqueue(sourceKey, 'video');
    const job = await media.claim();
    expect(job?.id).toBe(id);
    await media.complete(id, { duration: 12.5, hasPoster: true });
    await storage.put(`streams/${id}/master.m3u8`, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\nv0/index.m3u8\n');
    await storage.put(`streams/${id}/v0/index.m3u8`, '#EXTM3U\n#EXTINF:4.0,\nseg_0000.ts\n#EXT-X-ENDLIST\n');
    return id;
  };

  it('hands each pending job to exactly one worker and resumes interrupted ones', async () => {
    const { id } = await media.enqueue('files/a.mp4', 'video');

    expect((await media.claim())?.id).toBe(id);
    expect(await media.claim()).toBeUndefined();
    await media.recoverInterrupted();
    expect((await media.claim())?.id).toBe(id);
  });

  it('serves playlists that point back at the API and at signed segment URLs', async () => {
    const id = await ready('files/movies/a.mp4');

    expect((await media.streamsFor(['files/movies/a.mp4'])).get('files/movies/a.mp4')).toEqual({
      id,
      status: 'ready',
      playlist: `/api/media/${id}/master.m3u8`,
      poster: `/api/media/${id}/poster.jpg`,
      duration: 12.5,
    });
    const master = await media.file(bob, 'localhost', id, 'master.m3u8');
    const variant = await media.file(bob, 'localhost', id, 'v0.m3u8');

    expect(master).toEqual({ type: 'playlist', body: expect.stringContaining('\nv0.m3u8\n') });
    expect(variant).toEqual({ type: 'playlist', body: expect.stringContaining(`http://localhost:9000/streams/${id}/v0/seg_0000.ts`) });
    await expect(media.file(bob, 'localhost', id, 'v7.m3u8')).rejects.toThrow('Not found');
  });

  it('applies the source file access rules to its stream', async () => {
    const own = await ready('files/users/bob/clip.mp4');
    const other = await ready('files/users/alice/clip.mp4');
    const attachment = await ready('attachments/video/x/clip.mp4');

    await expect(media.file(bob, 'localhost', own, 'master.m3u8')).resolves.toMatchObject({ type: 'playlist' });
    await expect(media.file(bob, 'localhost', attachment, 'master.m3u8')).resolves.toMatchObject({ type: 'playlist' });
    await expect(media.file(bob, 'localhost', other, 'master.m3u8')).rejects.toThrow('Stream not found');
    await expect(media.file(admin, 'localhost', other, 'poster.jpg')).resolves.toMatchObject({ type: 'redirect' });
  });

  it('follows renames and cleans up outputs when the source goes away mid-transcode', async () => {
    const id = await ready('files/shows/s1/ep.mkv');
    await media.movePrefix('files/shows/', 'files/series/');
    expect((await media.streamsFor(['files/series/s1/ep.mkv'])).get('files/series/s1/ep.mkv')?.id).toBe(id);

    const { id: orphan } = await media.enqueue('files/gone.mp4', 'video');
    await media.forget(['files/gone.mp4']);
    await storage.put(`streams/${orphan}/master.m3u8`, '#EXTM3U');
    expect(await media.complete(orphan, { duration: 1, hasPoster: false })).toBe(false);
    expect([...storage.objects.keys()].some((key) => key.includes(orphan))).toBe(false);
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

describe.skipIf(!hasFfmpeg)('transcode with ffmpeg', () => {
  let dir: string;
  const tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'transcode-spec-'));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const generate = (output: string, ...args: string[]) => {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, output]);
    expect(result.status).toBe(0);
    return output;
  };

  it('produces an adaptive video ladder with a poster', { timeout: 120_000 }, async () => {
    const input = generate(
      join(dir, 'in.mp4'),
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=854x480:rate=24:duration=3',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      '-shortest'
    );
    const out = join(dir, 'hls');

    const result = await transcode(tools, input, out, 'video');
    const master = await readFile(join(out, 'master.m3u8'), 'utf8');

    expect(result.hasPoster).toBe(true);
    expect(result.duration).toBeCloseTo(3, 0);
    expect(master.match(/^v\d+\/index\.m3u8$/gm)).toEqual(['v0/index.m3u8', 'v1/index.m3u8']);
    expect(master).toContain('RESOLUTION=854x480');
    expect((await readdir(join(out, 'v1'))).some((name) => name.endsWith('.ts'))).toBe(true);
  });

  it('produces a multi-bitrate audio ladder and ignores cover art', { timeout: 120_000 }, async () => {
    const input = generate(join(dir, 'in.m4a'), '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-c:a', 'aac');
    const out = join(dir, 'hls');

    const result = await transcode(tools, input, out, 'audio');
    const master = await readFile(join(out, 'master.m3u8'), 'utf8');

    expect(result.hasPoster).toBe(false);
    expect(master.match(/^v\d+\/index\.m3u8$/gm)).toHaveLength(3);
  });

  it('fails clearly on input without media streams', async () => {
    const input = join(dir, 'empty.mp4');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(input, 'not a video'));
    await expect(transcode(tools, input, join(dir, 'hls'), 'video')).rejects.toThrow('ffprobe exited');
  });
});
