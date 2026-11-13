import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActivityService, apiArea, pageArea } from '../src/activity/activity.service.js';
import type { Database } from '../src/database/database.js';
import { createTestDatabase } from './support.js';

describe('apiArea', () => {
  it.each([
    ['/api/files', 'files'],
    ['/api/files/raw', 'files'],
    ['/api/markdown/summary', 'markdown'],
    ['/api/system', null],
    ['/api/activity/pageview', null],
    ['/api/tools', null],
    ['/assets/index-abc.js', null],
    ['/tools/files', null],
  ])('%s -> %s', (path, area) => {
    expect(apiArea(path)).toBe(area);
  });
});

describe('pageArea', () => {
  it.each([
    ['/', 'home'],
    ['/?x=1', 'home'],
    ['/tools/files', 'files'],
    ['/tools/markdown?file=a.md', 'markdown'],
    ['/ds', null],
    ['/tools', null],
  ])('%s -> %s', (path, area) => {
    expect(pageArea(path)).toBe(area);
  });
});

describe('ActivityService', () => {
  let db: Database;
  let closeDb: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close: closeDb } = await createTestDatabase());
  });
  afterEach(() => closeDb());

  it('counts tracked areas per area and per minute over the last hour', () => {
    const activity = new ActivityService(db);
    const now = Date.UTC(2026, 0, 1, 12, 0, 30);

    activity.track('files', now - 61 * 60_000);
    activity.track('files', now);
    activity.track('markdown', now);
    activity.track(null, now);

    const snapshot = activity.snapshot(now);
    expect(snapshot.totalRequests).toBe(3);
    expect(snapshot.perArea).toEqual([
      { area: 'files', count: 2 },
      { area: 'markdown', count: 1 },
    ]);
    expect(snapshot.lastHour).toHaveLength(60);
    expect(snapshot.lastHour.at(-1)).toBe(2);
    expect(snapshot.lastHour.reduce((a, b) => a + b)).toBe(2);
  });

  it('stores events and pages through them newest first, per user or for everyone', async () => {
    const activity = new ActivityService(db);
    for (let i = 0; i < 5; i++) await activity.record('files', 'upload', `f${i}`, i % 2 ? 'bob' : 'admin');

    const firstPage = await activity.events({ page: 1, pageSize: 2 });
    const bobs = await activity.eventsOf('bob', { page: 1, pageSize: 50 });

    expect(firstPage.items.map((event) => event.detail)).toEqual(['f4', 'f3']);
    expect(firstPage.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(bobs.items.map((event) => event.detail)).toEqual(['f3', 'f1']);
  });
});
