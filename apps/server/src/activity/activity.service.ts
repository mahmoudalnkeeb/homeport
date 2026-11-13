import { Injectable, Logger } from '@nestjs/common';
import type { ActivitySnapshot } from '@homeport/contracts';
import { count, desc, eq } from 'drizzle-orm';

import { Paginated, pageWindow, type PaginationQueryDto } from '../common/http/pagination.js';
import { InjectDb, type Database } from '../database/database.js';
import { activityEvents, type ActivityEventRow } from './activity.schema.js';

const MINUTE = 60_000;
const WINDOW_MINUTES = 60;
const UNTRACKED_API = new Set(['system', 'activity', 'tools', 'health']);

export function apiArea(path: string): string | null {
  const [prefix, area] = path.split('/').filter(Boolean);
  return prefix === 'api' && area && !UNTRACKED_API.has(area) ? area : null;
}

export function pageArea(path: string): string | null {
  const [first, second] = (path.split(/[?#]/)[0] ?? '').split('/').filter(Boolean);
  if (first === undefined) return 'home';
  return first === 'tools' && second ? second : null;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private readonly startedAt = new Date();
  private total = 0;
  private readonly perArea = new Map<string, number>();
  private readonly perMinute = new Map<number, number>();

  constructor(@InjectDb() private readonly db: Database) {}

  track(area: string | null, now = Date.now()): void {
    if (!area) return;
    this.total++;
    this.perArea.set(area, (this.perArea.get(area) ?? 0) + 1);
    const minute = Math.floor(now / MINUTE);
    this.perMinute.set(minute, (this.perMinute.get(minute) ?? 0) + 1);
    for (const key of this.perMinute.keys()) {
      if (key <= minute - WINDOW_MINUTES) this.perMinute.delete(key);
    }
  }

  async record(tool: string, action: string, detail: string, username: string): Promise<void> {
    try {
      await this.db.insert(activityEvents).values({ tool, action, detail, username });
    } catch (error) {
      this.logger.error({ event: 'activity.record.failed', tool, action, error: error instanceof Error ? error.message : String(error) });
    }
  }

  events(query: PaginationQueryDto): Promise<Paginated<ActivityEventRow>> {
    return this.page(query);
  }

  eventsOf(username: string, query: PaginationQueryDto): Promise<Paginated<ActivityEventRow>> {
    return this.page(query, username);
  }

  private async page(query: PaginationQueryDto, username?: string): Promise<Paginated<ActivityEventRow>> {
    const { offset, ...window } = pageWindow(query);
    const where = username === undefined ? undefined : eq(activityEvents.username, username);
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(activityEvents)
        .where(where)
        .orderBy(desc(activityEvents.at), desc(activityEvents.id))
        .limit(window.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(activityEvents).where(where),
    ]);
    return Paginated.of(rows, window, total?.value ?? 0);
  }

  snapshot(now = Date.now()): ActivitySnapshot {
    const minute = Math.floor(now / MINUTE);
    return {
      since: this.startedAt.toISOString(),
      totalRequests: this.total,
      lastHour: Array.from({ length: WINDOW_MINUTES }, (_, i) => this.perMinute.get(minute - WINDOW_MINUTES + 1 + i) ?? 0),
      perArea: [...this.perArea].map(([area, value]) => ({ area, count: value })).sort((a, b) => b.count - a.count),
    };
  }
}
