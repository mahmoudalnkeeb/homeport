import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../src/database/database.js';
import { MediaService } from '../src/media/media.service.js';
import { parseEpisodePath, parseMoviePath } from '../src/tools/watch/naming.js';
import { posterKey, type WatchService } from '../src/tools/watch/watch.service.js';
import { users, type Actor } from '../src/users/users.schema.js';
import { MemoryStorage } from './memory-storage.js';
import { createTestDatabase, fakeQueue, libraryServices, testEnv } from './support.js';

const page = { page: 1, pageSize: 50 };

describe('parseMoviePath', () => {
  it('reads title and year from the file or its folder', () => {
    expect(parseMoviePath('Inception (2010).mkv')).toEqual({ kind: 'movie', title: 'Inception', year: 2010 });
    expect(parseMoviePath('The.Matrix.1999.1080p.BluRay.x264.mkv')).toEqual({ kind: 'movie', title: 'The Matrix', year: 1999 });
    expect(parseMoviePath('Arrival (2016)/arrival-sample.mkv')).toEqual({ kind: 'movie', title: 'Arrival', year: 2016 });
    expect(parseMoviePath('Home Video.mp4')).toEqual({ kind: 'movie', title: 'Home Video', year: null });
  });
});

describe('parseEpisodePath', () => {
  it('reads show, season and episode from SxxEyy names', () => {
    expect(parseEpisodePath('Breaking Bad (2008)/Season 01/Breaking.Bad.S01E02.Cats.in.the.Bag.mkv')).toEqual({
      kind: 'episode',
      folder: 'Breaking Bad (2008)',
      show: 'Breaking Bad',
      year: 2008,
      season: 1,
      episode: 2,
      title: 'Cats in the Bag',
    });
  });

  it('accepts 1x03 names and season folders with bare episode numbers', () => {
    expect(parseEpisodePath('Show/Show 1x03.mkv')).toMatchObject({ show: 'Show', season: 1, episode: 3, title: null });
    expect(parseEpisodePath('Show/Season 2/05.mkv')).toMatchObject({ show: 'Show', season: 2, episode: 5 });
  });

  it('rejects files without episode markers', () => {
    expect(parseEpisodePath('Show/random clip.mkv')).toBeNull();
  });
});

describe('WatchService', () => {
  let db: Database;
  let closeDb: () => Promise<void>;
  let storage: MemoryStorage;
  let media: MediaService;
  let mediaQueue: ReturnType<typeof fakeQueue>;
  let watch: WatchService;
  let watchQueue: ReturnType<typeof fakeQueue>;
  let bob: Actor;
  let alice: Actor;

  const movieKey = 'files/library/movies/Inception (2010).mkv';
  const episodeKey = (n: number) => `files/library/tv/Severance (2022)/Season 01/Severance.S01E0${n}.mkv`;

  const build = (env = testEnv()) => {
    mediaQueue = fakeQueue();
    media = new MediaService(db, storage, mediaQueue);
    ({ watch, watchQueue } = libraryServices(db, storage, media, env));
  };

  beforeEach(async () => {
    ({ db, close: closeDb } = await createTestDatabase());
    storage = new MemoryStorage();
    build();
    const rows = await db
      .insert(users)
      .values((['bob', 'alice'] as const).map((username) => ({ username, displayName: username, role: 'member' as const, passwordHash: 'x' })))
      .returning();
    [bob, alice] = rows.map(({ id, username, role }) => ({ id, username, role })) as [Actor, Actor];
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await closeDb();
  });

  it('only queues video files under the movie and TV roots', async () => {
    await watch.index(movieKey);
    await watch.index('files/library/movies/notes.txt');
    await watch.index('files/videos/Inception (2010).mkv');
    expect(watchQueue.add).toHaveBeenCalledTimes(1);
    expect(watchQueue.add).toHaveBeenCalledWith('index', { key: movieKey });
  });

  it('indexes a movie from its name when TMDB is not configured', async () => {
    await storage.put(movieKey, 'v');
    await watch.indexNow(movieKey);

    const movies = await watch.movies(bob, page);
    expect(movies.items).toMatchObject([
      { kind: 'movie', title: 'Inception', year: 2010, overview: null, poster: null, path: 'library/movies/Inception (2010).mkv', progress: null },
    ]);
  });

  it('skips keys whose object no longer exists', async () => {
    await watch.indexNow(movieKey);
    expect((await watch.movies(bob, page)).items).toEqual([]);
  });

  it('enriches movies from TMDB and stores the poster', async () => {
    build(testEnv({ TMDB_TOKEN: 'tmdb-token-for-tests-123456' }));
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/search/movie')) {
        return Response.json({
          results: [{ id: 27205, title: 'Inception', overview: 'Dreams within dreams.', poster_path: '/poster.jpg', release_date: '2010-07-15' }],
        });
      }
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', fetch);
    await storage.put(movieKey, 'v');

    await watch.indexNow(movieKey);

    const [movie] = (await watch.movies(bob, page)).items;
    expect(movie).toMatchObject({ title: 'Inception', year: 2010, overview: 'Dreams within dreams.' });
    expect(movie?.poster).toBe(`/api/watch/posters/${movie?.id}`);
    expect(storage.objects.has(posterKey(movie?.id ?? ''))).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toContain('year=2010');
  });

  it('groups episodes under one show and removes the show with its last episode', async () => {
    for (const n of [2, 1]) {
      await storage.put(episodeKey(n), 'v');
      await watch.indexNow(episodeKey(n));
    }

    const shows = await watch.shows(page);
    expect(shows.items).toMatchObject([{ title: 'Severance', year: 2022, episodes: 2 }]);
    const detail = await watch.show(bob, shows.items[0]?.id ?? '');
    expect(detail.videos.map((video) => [video.season, video.episode])).toEqual([
      [1, 1],
      [1, 2],
    ]);

    await watch.forget([episodeKey(1)]);
    expect((await watch.shows(page)).items[0]?.episodes).toBe(1);
    await watch.forgetPrefix('files/library/tv/Severance (2022)/');
    expect((await watch.shows(page)).items).toEqual([]);
  });

  it('tracks progress per user and drops finished videos from continue watching', async () => {
    await storage.put(movieKey, 'v');
    await watch.indexNow(movieKey);
    const [movie] = (await watch.movies(bob, page)).items;
    const id = movie?.id ?? '';

    await watch.saveProgress(bob, id, { position: 600, duration: 6000 });
    expect((await watch.continueWatching(bob)).items).toMatchObject([{ id, progress: { position: 600, completed: false } }]);
    expect((await watch.continueWatching(alice)).items).toEqual([]);
    expect((await watch.video(alice, id)).progress).toBeNull();

    const done = await watch.saveProgress(bob, id, { position: 5500, duration: 6000 });
    expect(done.completed).toBe(true);
    expect((await watch.continueWatching(bob)).items).toEqual([]);
  });

  it('rejects progress for unknown videos', async () => {
    await expect(watch.saveProgress(bob, '00000000-0000-4000-8000-000000000000', { position: 1, duration: 2 })).rejects.toThrow('Video not found');
  });

  it('rescans: queues new files, drops missing ones and starts missing transcodes', async () => {
    await storage.put(movieKey, 'v');
    await watch.indexNow(movieKey);
    await storage.remove([movieKey]);
    await storage.put(episodeKey(1), 'v');

    const result = await watch.rescan();

    expect(result).toEqual({ queued: 1, removed: 1 });
    expect(watchQueue.addBulk).toHaveBeenCalledWith([{ name: 'index', data: { key: episodeKey(1) } }]);
    expect(mediaQueue.add).toHaveBeenCalledTimes(1);
    expect((await watch.movies(bob, page)).items).toEqual([]);
  });
});
