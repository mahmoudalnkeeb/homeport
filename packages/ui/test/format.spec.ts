import { describe, expect, it } from 'vitest';

import { formatBytes, formatDuration, timeAgo } from '../src/format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1536, '1.5 KB'],
    [150 * 1024 * 1024, '150 MB'],
    [3.25 * 1024 ** 4, '3.3 TB'],
  ])('%d -> %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    [59, '0m'],
    [3_660, '1h 1m'],
    [90_000, '1d 1h'],
  ])('%d s -> %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('timeAgo', () => {
  const now = Date.UTC(2026, 0, 10, 12);
  it.each([
    [new Date(now - 30_000).toISOString(), '30 seconds ago'],
    [new Date(now - 5 * 60_000).toISOString(), '5 minutes ago'],
    [new Date(now - 26 * 3_600_000).toISOString(), 'yesterday'],
  ])('%s -> %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
});
