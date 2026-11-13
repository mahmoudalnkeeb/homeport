import 'reflect-metadata';

import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { DB } from '../src/database/database.js';
import { StorageService } from '../src/storage/storage.service.js';
import { MemoryStorage } from './memory-storage.js';
import { createTestDatabase } from './support.js';

describe('behind a trusted HTTPS proxy', () => {
  let app: NestNodeApplication;
  let base: string;
  let dir: string;
  let closeDb: () => Promise<void>;
  const ADMIN_PASSWORD = 'admin-password-1';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'proxy-spec-'));
    Object.assign(process.env, {
      TRANSCODE_CONCURRENCY: '0',
      STATE_DIR: join(dir, 'state'),
      ADMIN_PASSWORD,
      HOST_AGENT_URL: '',
      DATABASE_URL: 'postgres://unused@localhost/unused',
    });
    const database = await createTestDatabase();
    closeDb = database.close;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DB)
      .useValue(database.db)
      .overrideProvider(StorageService)
      .useValue(new MemoryStorage())
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter({ trustProxy: '127.0.0.1' }), { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
    await rm(dir, { recursive: true, force: true });
  });

  const login = (password: string, client: string) =>
    fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: {
        'X-Homeport-Request': '1',
        'Content-Type': 'application/json',
        'X-Forwarded-For': client,
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ username: 'admin', password }),
    });

  it('marks the session cookie Secure when the proxy reports HTTPS', async () => {
    const response = await login(ADMIN_PASSWORD, '192.168.1.20');
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/;\s*Secure/i);
  });

  it('locks out only the client that failed, not everyone behind the proxy', async () => {
    for (let i = 0; i < 5; i++) expect((await login('wrong-password', '192.168.1.66')).status).toBe(401);

    expect((await login(ADMIN_PASSWORD, '192.168.1.66')).status).toBe(429);
    expect((await login(ADMIN_PASSWORD, '192.168.1.21')).status).toBe(200);
  });
});
