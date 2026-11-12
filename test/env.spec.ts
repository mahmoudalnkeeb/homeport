import { describe, expect, it } from 'vitest';

import { envSchema } from '../src/config/env.js';

describe('envSchema LAN_URLS', () => {
  it('defaults to an empty list', () => {
    expect(envSchema.parse({}).LAN_URLS).toEqual([]);
    expect(envSchema.parse({ LAN_URLS: '' }).LAN_URLS).toEqual([]);
  });

  it('splits and trims comma-separated URLs', () => {
    expect(envSchema.parse({ LAN_URLS: 'http://192.168.1.20:3000, http://lab.local:3000' }).LAN_URLS).toEqual([
      'http://192.168.1.20:3000',
      'http://lab.local:3000',
    ]);
  });

  it('rejects values that are not URLs', () => {
    expect(() => envSchema.parse({ LAN_URLS: '192.168.1.20' })).toThrow();
  });
});
