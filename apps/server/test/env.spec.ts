import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { envSchema, REPO_ROOT } from '../src/config/env.js';

const BASE = { DATABASE_URL: 'postgres://test@localhost/test' };

describe('envSchema LAN_URLS', () => {
  it('defaults to an empty list', () => {
    expect(envSchema.parse(BASE).LAN_URLS).toEqual([]);
    expect(envSchema.parse({ ...BASE, LAN_URLS: '' }).LAN_URLS).toEqual([]);
  });

  it('splits and trims comma-separated URLs', () => {
    expect(envSchema.parse({ ...BASE, LAN_URLS: 'http://192.168.1.20:3000, http://lab.local:3000' }).LAN_URLS).toEqual([
      'http://192.168.1.20:3000',
      'http://lab.local:3000',
    ]);
  });

  it('rejects values that are not URLs', () => {
    expect(() => envSchema.parse({ ...BASE, LAN_URLS: '192.168.1.20' })).toThrow();
  });
});

describe('envSchema paths', () => {
  it('resolves relative paths against the repository root, not the working directory', () => {
    const env = envSchema.parse(BASE);
    expect(env.DATA_DIR).toBe(join(REPO_ROOT, 'data'));
    expect(env.WEB_DIST).toBe(join(REPO_ROOT, 'apps', 'web', 'dist'));
    expect(existsSync(join(REPO_ROOT, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('keeps absolute paths as given', () => {
    const absolute = resolve('/srv/media');
    expect(envSchema.parse({ ...BASE, DATA_DIR: absolute }).DATA_DIR).toBe(absolute);
  });
});

describe('envSchema STATE_DIR', () => {
  it('refuses a state folder inside the data folder, where users could download it', () => {
    const data = resolve('/srv/data');
    expect(() => envSchema.parse({ ...BASE, DATA_DIR: data, STATE_DIR: join(data, 'state') })).toThrow('STATE_DIR');
    expect(envSchema.parse({ ...BASE, DATA_DIR: data, STATE_DIR: resolve('/srv/state') }).STATE_DIR).toBe(resolve('/srv/state'));
  });
});
