import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { ENV, type Environment } from '../config/env.js';
import { CASING, DB, MIGRATIONS_DIR, PG_POOL, type Database } from './database.js';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Environment) => new Pool({ connectionString: env.DATABASE_URL, max: 10 }),
    },
    {
      provide: DB,
      inject: [ENV, PG_POOL],
      useFactory: async (env: Environment, pool: Pool): Promise<Database> => {
        const db = drizzle({ client: pool, casing: CASING });
        if (env.DB_MIGRATE) {
          await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
          new Logger('Database').log({ event: 'db.migrated' });
        }
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
