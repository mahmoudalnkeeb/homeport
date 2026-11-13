import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { envSchema, REPO_ROOT } from '../src/config/env.js';
import { hostnameOf } from '../src/storage/request-host.js';
import { StorageService } from '../src/storage/storage.service.js';

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
    expect(env.STATE_DIR).toBe(join(REPO_ROOT, 'state'));
    expect(env.WEB_DIST).toBe(join(REPO_ROOT, 'apps', 'web', 'dist'));
    expect(existsSync(join(REPO_ROOT, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('keeps absolute paths as given', () => {
    const absolute = resolve('/srv/state');
    expect(envSchema.parse({ ...BASE, STATE_DIR: absolute }).STATE_DIR).toBe(absolute);
  });
});

describe('envSchema object storage', () => {
  it('signs browser URLs against the address the browser used unless a public endpoint is pinned', () => {
    const storage = (env: Record<string, string>) =>
      new StorageService(envSchema.parse({ ...BASE, S3_ENDPOINT: 'http://minio:9000', ...env }));
    expect(storage({}).publicEndpointFor('192.168.1.20')).toBe('http://192.168.1.20:9000');
    expect(storage({}).publicEndpointFor('homeport.tail1234.ts.net')).toBe('http://homeport.tail1234.ts.net:9000');
    expect(storage({ S3_PUBLIC_PORT: '9100' }).publicEndpointFor('[::1]')).toBe('http://[::1]:9100');
    expect(storage({ S3_PUBLIC_ENDPOINT: 'https://s3.lab.example' }).publicEndpointFor('192.168.1.20')).toBe('https://s3.lab.example');
  });

  it('reads the hostname from the Host header', () => {
    expect(hostnameOf('100.64.0.7:3000')).toBe('100.64.0.7');
    expect(hostnameOf('[::1]:5173')).toBe('[::1]');
    expect(() => hostnameOf(undefined)).toThrow('Host');
  });

  it('rejects invalid bucket names', () => {
    expect(() => envSchema.parse({ ...BASE, S3_BUCKET: 'Bad_Bucket' })).toThrow('bucket');
  });
});

describe('envSchema S3 credentials', () => {
  it('refuses the public default secret in production', () => {
    expect(() => envSchema.parse({ ...BASE, NODE_ENV: 'production' })).toThrow('S3_SECRET_KEY');
    expect(envSchema.parse({ ...BASE, NODE_ENV: 'production', S3_SECRET_KEY: 'a-real-secret' }).S3_SECRET_KEY).toBe('a-real-secret');
    expect(envSchema.parse(BASE).S3_SECRET_KEY).toBe('homeport-minio');
  });
});
