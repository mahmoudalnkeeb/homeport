import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { envSchema, type Environment } from '../src/config/env.js';
import { CASING, MIGRATIONS_DIR, type Database } from '../src/database/database.js';

export const testEnv = (overrides: Record<string, string> = {}): Environment =>
  envSchema.parse({ DATABASE_URL: 'postgres://test@localhost/test', ...overrides });

export async function createTestDatabase(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle({ client, casing: CASING });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, close: () => client.close() };
}
