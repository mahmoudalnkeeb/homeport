import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { InjectDb, type Database } from '../database/database.js';

export interface Health {
  status: 'ok';
  database: 'ok';
}

@Injectable()
export class HealthService {
  constructor(@InjectDb() private readonly db: Database) {}

  async check(): Promise<Health> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok', database: 'ok' };
  }
}
