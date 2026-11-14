import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { vi } from 'vitest';

import { envSchema, type Environment } from '../src/config/env.js';
import { CASING, MIGRATIONS_DIR, type Database } from '../src/database/database.js';
import type { MediaService } from '../src/media/media.service.js';
import type { StorageService } from '../src/storage/storage.service.js';
import { MusicService } from '../src/tools/music/music.service.js';
import { TmdbClient } from '../src/tools/watch/tmdb.js';
import { WatchService } from '../src/tools/watch/watch.service.js';

export const testEnv = (overrides: Record<string, string> = {}): Environment =>
  envSchema.parse({ DATABASE_URL: 'postgres://test@localhost/test', ...overrides });

export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, casing: CASING });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, close: () => client.close() };
}

export const fakeQueue = () => ({ add: vi.fn(), addBulk: vi.fn() });

export function libraryServices(db: Database, storage: StorageService, media: MediaService, env: Environment = testEnv()) {
  const watchQueue = fakeQueue();
  const musicQueue = fakeQueue();
  const tmdb = new TmdbClient(env);
  return {
    watch: new WatchService(db, storage, media, tmdb, watchQueue),
    music: new MusicService(db, storage, musicQueue),
    tmdb,
    watchQueue,
    musicQueue,
  };
}
