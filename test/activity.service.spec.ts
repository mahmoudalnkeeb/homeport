import { describe, expect, it } from 'vitest';

import { ActivityService, areaOf } from '../src/activity/activity.service.js';

describe('areaOf', () => {
  it.each([
    ['/', 'home'],
    ['/api/files', 'files'],
    ['/api/system', null],
    ['/api/activity', null],
    ['/tools/markdown/', 'markdown'],
    ['/tools/markdown/markdown.js', null],
    ['/ds/', null],
    ['/ds/ds.css', null],
    ['/vendor/mermaid/mermaid.esm.min.mjs', null],
  ])('%s -> %s', (path, area) => {
    expect(areaOf(path)).toBe(area);
  });
});

describe('ActivityService', () => {
  it('counts requests per area and per minute over the last hour', () => {
    const activity = new ActivityService();
    const now = Date.UTC(2026, 0, 1, 12, 0, 30);

    activity.track('/api/files', now - 61 * 60_000);
    activity.track('/api/files', now);
    activity.track('/tools/markdown/', now);
    activity.track('/api/system', now);

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

  it('keeps the newest events first and caps the list', () => {
    const activity = new ActivityService();
    for (let i = 0; i < 60; i++) activity.record('files', 'upload', `f${i}`);

    const { events } = activity.snapshot();
    expect(events).toHaveLength(50);
    expect(events[0]?.detail).toBe('f59');
  });
});
