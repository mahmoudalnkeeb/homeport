import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/database/database.js';
import { MediaService } from '../src/media/media.service.js';
import { coverKey, type MusicService } from '../src/tools/music/music.service.js';
import { extractCover, probeTags } from '../src/media/transcode.js';
import { trackInfo, UNKNOWN_ARTIST } from '../src/tools/music/tags.js';
import { MemoryStorage } from './memory-storage.js';
import { createTestDatabase, fakeQueue, libraryServices } from './support.js';

const page = { page: 1, pageSize: 50 };

describe('trackInfo', () => {
  it('prefers tags and normalises numbers and dates', () => {
    expect(
      trackInfo('x/y/file.flac', {
        title: 'Paranoid Android',
        artist: 'Radiohead',
        album_artist: 'Radiohead',
        album: 'OK Computer',
        track: '2/12',
        disc: '1/1',
        date: '1997-05-21',
      })
    ).toEqual({ title: 'Paranoid Android', artist: 'Radiohead', albumArtist: 'Radiohead', album: 'OK Computer', trackNo: 2, discNo: 1, year: 1997 });
  });

  it('falls back to Artist/Album/NN Title paths', () => {
    expect(trackInfo('Massive Attack/Mezzanine/03 - Teardrop.mp3', {})).toEqual({
      title: 'Teardrop',
      artist: 'Massive Attack',
      albumArtist: 'Massive Attack',
      album: 'Mezzanine',
      trackNo: 3,
      discNo: null,
      year: null,
    });
    expect(trackInfo('loose.mp3', {})).toMatchObject({ title: 'loose', artist: UNKNOWN_ARTIST, album: 'Unknown album' });
  });

  it('uses the track artist as album artist when no album artist tag exists', () => {
    expect(trackInfo('a.mp3', { artist: 'Björk', album: 'Homogenic' })).toMatchObject({ artist: 'Björk', albumArtist: 'Björk' });
  });
});

describe('MusicService', () => {
  let db: Database;
  let closeDb: () => Promise<void>;
  let storage: MemoryStorage;
  let music: MusicService;
  let musicQueue: ReturnType<typeof fakeQueue>;

  const key = (name: string) => `files/library/music/${name}`;
  const save = (name: string, tags: Record<string, string>, duration = 200) =>
    music.saveTrack(key(name), trackInfo(name, tags), duration);

  beforeEach(async () => {
    ({ db, close: closeDb } = await createTestDatabase());
    storage = new MemoryStorage();
    ({ music, musicQueue } = libraryServices(db, storage, new MediaService(db, storage, fakeQueue())));
  });

  afterEach(() => closeDb());

  it('only queues audio under the music root', async () => {
    await music.index(key('a.mp3'));
    await music.index(key('cover.jpg'));
    await music.index('files/audio/a.mp3');
    expect(musicQueue.add).toHaveBeenCalledTimes(1);
  });

  it('groups tracks into albums ordered by disc and track number', async () => {
    await save('b.mp3', { title: 'Second', artist: 'A', album: 'Record', track: '2', date: '2001' });
    await save('a.mp3', { title: 'First', artist: 'A', album: 'Record', track: '1' });
    await save('c.mp3', { title: 'Other', artist: 'B', album: 'Elsewhere' });

    const albums = await music.albums(page);
    expect(albums.items.map((album) => [album.albumArtist, album.title, album.tracks, album.year])).toEqual([
      ['A', 'Record', 2, 2001],
      ['B', 'Elsewhere', 1, null],
    ]);
    const detail = await music.album(albums.items[0]?.id ?? '');
    expect(detail.trackList.map((track) => track.title)).toEqual(['First', 'Second']);
    expect(detail.trackList[0]?.url).toBe('/api/files/raw?path=library%2Fmusic%2Fa.mp3');

    expect((await music.albums({ ...page, artist: 'B' })).items.map((album) => album.title)).toEqual(['Elsewhere']);
    expect((await music.artists(page)).items).toEqual([
      { name: 'A', albums: 1, cover: null },
      { name: 'B', albums: 1, cover: null },
    ]);
    expect((await music.tracks({ ...page, q: 'record' })).items).toHaveLength(2);
  });

  it('moves a retagged track and removes the emptied album', async () => {
    await save('a.mp3', { title: 'Song', artist: 'A', album: 'Old' });
    await save('a.mp3', { title: 'Song', artist: 'A', album: 'New' });
    expect((await music.albums(page)).items.map((album) => album.title)).toEqual(['New']);
  });

  it('stores covers and deletes them with the last track', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'music-spec-'));
    try {
      const album = await save('a.mp3', { title: 'Song', artist: 'A', album: 'Art' });
      const file = join(dir, 'cover.jpg');
      await writeFile(file, 'jpg');
      await music.saveCover(album.id, file);
      expect((await music.album(album.id)).cover).toBe(`/api/music/covers/${album.id}`);
      expect((await music.artists(page)).items[0]?.cover).toBe(`/api/music/covers/${album.id}`);

      await music.forget([key('a.mp3')]);
      expect((await music.albums(page)).items).toEqual([]);
      expect(storage.objects.has(coverKey(album.id))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats LIKE wildcards in searches as literal text', async () => {
    await save('a.mp3', { title: 'x', artist: 'A', album: '100% Hits' });
    await save('b.mp3', { title: 'y', artist: 'A', album: 'Other_Side' });
    await save('c.mp3', { title: 'z', artist: 'A', album: 'Plain' });

    expect((await music.albums({ ...page, q: '%' })).items.map((album) => album.title)).toEqual(['100% Hits']);
    expect((await music.albums({ ...page, q: '_' })).items.map((album) => album.title)).toEqual(['Other_Side']);
  });

  it('rescans the music folder', async () => {
    await save('gone.mp3', { title: 'Gone', artist: 'A', album: 'X' });
    await storage.put(key('new.flac'), 'a');
    await storage.put(key('folder.jpg'), 'i');

    expect(await music.rescan()).toEqual({ queued: 1, removed: 1 });
    expect(musicQueue.addBulk).toHaveBeenCalledWith([{ name: 'index', data: { key: key('new.flac') } }]);
  });
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

describe.skipIf(!hasFfmpeg)('tags with ffmpeg', () => {
  const tools = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };

  it('reads tags and extracts embedded cover art', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'music-ffmpeg-'));
    try {
      const art = join(dir, 'art.png');
      const song = join(dir, 'song.mp3');
      const cover = join(dir, 'cover.jpg');
      const make = (args: string[]) => expect(spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]).status).toBe(0);
      make(['-f', 'lavfi', '-i', 'color=c=red:s=800x800', '-frames:v', '1', art]);
      make([
        ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-i', art],
        ...['-map', '0:a', '-map', '1:v', '-c:a', 'libmp3lame', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', '-id3v2_version', '3'],
        ...['-metadata', 'title=Test Song', '-metadata', 'artist=Tester', '-metadata', 'album=Fixtures', '-metadata', 'track=4/9', '-metadata', 'date=2021'],
        song,
      ]);

      const probed = await probeTags(tools, song);
      expect(probed.hasCover).toBe(true);
      expect(probed.duration).toBeGreaterThan(1.5);
      expect(trackInfo('x.mp3', probed.tags)).toMatchObject({ title: 'Test Song', artist: 'Tester', album: 'Fixtures', trackNo: 4, year: 2021 });

      await extractCover(tools, song, cover);
      expect((await stat(cover)).size).toBeGreaterThan(0);
      const scaled = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', cover], { encoding: 'utf8' });
      expect(Number(scaled.stdout.trim())).toBe(600);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
