import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gt, lte, ne } from 'drizzle-orm';

import { ENV, type Environment } from '../config/env.js';
import { InjectDb, type Database } from '../database/database.js';
import { sessions, type Session } from './sessions.schema.js';

const DAY = 86_400_000;
const TOUCH_INTERVAL_MS = 10 * 60_000;

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionsService {
  constructor(
    @InjectDb() private readonly db: Database,
    @Inject(ENV) private readonly env: Environment
  ) {}

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(sessions).values({
      id: digest(token),
      userId,
      expiresAt: new Date(Date.now() + this.env.SESSION_DAYS * DAY),
    });
    return token;
  }

  async find(token: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, digest(token)), gt(sessions.expiresAt, new Date())));
    if (!session) return null;
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));
    }
    return session;
  }

  async revoke(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, digest(token)));
  }

  async revokeAllFor(userId: string, keepToken?: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), keepToken ? ne(sessions.id, digest(keepToken)) : undefined));
  }

  async countActive(): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(sessions).where(gt(sessions.expiresAt, new Date()));
    return row?.value ?? 0;
  }

  async pruneExpired(): Promise<void> {
    await this.db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
  }
}
