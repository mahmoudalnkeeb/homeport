import 'reflect-metadata';

import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { DB } from '../src/database/database.js';
import { createTestDatabase } from './support.js';

describe('HTTP API', () => {
  let app: INestApplication;
  let base: string;
  let dir: string;
  let closeDb: () => Promise<void>;
  const ADMIN_PASSWORD = 'admin-password-1';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'http-spec-'));
    Object.assign(process.env, {
      DATA_DIR: join(dir, 'data'),
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
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
    await rm(dir, { recursive: true, force: true });
  });

  const call = (path: string, init: RequestInit & { cookie?: string; json?: unknown; csrf?: boolean } = {}) => {
    const { cookie, json, csrf = true, ...rest } = init;
    return fetch(`${base}${path}`, {
      ...rest,
      headers: {
        ...(csrf ? { 'X-Homelab-Request': '1' } : {}),
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
  };

  const body = async (response: Response): Promise<Record<string, unknown>> => (await response.json()) as Record<string, unknown>;

  const signIn = async (username: string, password: string) => {
    const response = await call('/auth/login', { method: 'POST', json: { username, password } });
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    return cookie.split(';')[0] ?? '';
  };

  describe('envelope', () => {
    it('wraps errors as { error: { status, code, message } }', async () => {
      const response = await call('/files');
      expect(response.status).toBe(401);
      expect(await body(response)).toEqual({ error: { status: 401, code: 'UNAUTHENTICATED', message: 'Sign in required' } });
    });

    it('rejects state-changing requests without the CSRF header, even for sign-in', async () => {
      const response = await call('/auth/login', { method: 'POST', json: { username: 'admin', password: ADMIN_PASSWORD }, csrf: false });
      expect(response.status).toBe(403);
      expect(await body(response)).toMatchObject({ error: { code: 'CSRF_HEADER_MISSING' } });
    });

    it('reports every broken field as 422 VALIDATION_FAILED, and rejects unknown fields', async () => {
      const response = await call('/auth/login', { method: 'POST', json: { username: '', password: 5, admin: true } });
      expect(response.status).toBe(422);
      const { error } = (await body(response)) as { error: { code: string; details: { field: string }[] } };
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(new Set(error.details.map((detail) => detail.field))).toEqual(new Set(['username', 'password', 'admin']));
    });

    it('wraps objects as { data } and lists as { data, meta }, exposing only DTO fields', async () => {
      const admin = await signIn('admin', ADMIN_PASSWORD);
      expect(await body(await call('/auth/me', { cookie: admin }))).toEqual({
        data: expect.objectContaining({ username: 'admin', role: 'admin', home: 'users/admin' }),
      });

      const list = await body(await call('/users?page=1&pageSize=10', { cookie: admin }));
      expect(list.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
      const [user] = list.data as Record<string, unknown>[];
      expect(Object.keys(user ?? {}).sort()).toEqual(
        ['createdAt', 'disabled', 'displayName', 'lastLoginAt', 'mustChangePassword', 'role', 'storageBytes', 'username'].sort()
      );
      expect(typeof user?.createdAt).toBe('string');

      expect((await call('/users?pageSize=1000', { cookie: admin })).status).toBe(422);
    });
  });

  it('gives admins everything and members only their share', async () => {
    const admin = await signIn('admin', ADMIN_PASSWORD);
    expect((await call('/system', { cookie: admin })).status).toBe(200);

    const created = await call('/users', {
      method: 'POST',
      cookie: admin,
      json: { username: ' Bob ', displayName: 'Bob', role: 'member', password: 'temporary-1' },
    });
    expect(created.status).toBe(201);
    expect(await body(created)).toMatchObject({ data: { username: 'bob', storageBytes: 0 } });
    expect((await call('/users', { method: 'POST', cookie: admin, json: { username: 'bob', displayName: 'B', role: 'member', password: 'temporary-1' } })).status).toBe(409);

    const firstLogin = await signIn('bob', 'temporary-1');
    const blocked = await call('/files', { cookie: firstLogin });
    expect(blocked.status).toBe(403);
    expect(await body(blocked)).toMatchObject({ error: { code: 'PASSWORD_CHANGE_REQUIRED' } });
    expect(await body(await call('/auth/me', { cookie: firstLogin }))).toMatchObject({ data: { mustChangePassword: true } });
    const changed = await call('/auth/password', {
      method: 'POST',
      cookie: firstLogin,
      json: { current: 'temporary-1', next: 'bob-password-1' },
    });
    expect(changed.status).toBe(200);

    const bob = firstLogin;
    expect((await call('/system', { cookie: bob })).status).toBe(403);
    expect((await call('/users', { cookie: bob })).status).toBe(403);
    expect((await call('/activity', { cookie: bob })).status).toBe(403);
    expect((await call('/activity/events', { cookie: bob })).status).toBe(403);
    expect((await call('/tools', { cookie: bob })).status).toBe(200);

    const library = await call('/files/folder', { method: 'POST', cookie: bob, json: { path: 'movies' } });
    expect(library.status).toBe(403);
    const own = await call('/files/folder', { method: 'POST', cookie: bob, json: { path: 'users/bob/movies' } });
    expect(own.status).toBe(200);
    expect(await body(own)).toEqual({ data: null });
    expect((await call('/files?path=users/admin', { cookie: bob })).status).toBe(404);

    const listing = await body(await call('/files?path=users/bob', { cookie: bob }));
    expect(listing).toMatchObject({ data: [{ name: 'movies', kind: 'folder' }], meta: { total: 1 } });

    const mine = await body(await call('/activity/mine', { cookie: bob }));
    expect(mine).toMatchObject({ data: [{ tool: 'files', action: 'mkdir', detail: 'users/bob/movies', user: 'bob' }], meta: { total: 1 } });

    const logout = await call('/auth/logout', { method: 'POST', cookie: bob });
    expect(logout.status).toBe(200);
    expect((await call('/auth/me', { cookie: bob })).status).toBe(401);
  });

  it('signs a user out everywhere when an admin disables them or resets their password', async () => {
    const admin = await signIn('admin', ADMIN_PASSWORD);
    await call('/users', { method: 'POST', cookie: admin, json: { username: 'carol', displayName: 'Carol', role: 'member', password: 'temporary-1' } });
    const carol = await signIn('carol', 'temporary-1');
    expect((await call('/auth/me', { cookie: carol })).status).toBe(200);

    await call('/users/carol/password', { method: 'POST', cookie: admin, json: { password: 'temporary-2' } });
    expect((await call('/auth/me', { cookie: carol })).status).toBe(401);

    const again = await signIn('carol', 'temporary-2');
    expect((await call('/users/carol', { method: 'PATCH', cookie: admin, json: { disabled: true } })).status).toBe(200);
    expect((await call('/auth/me', { cookie: again })).status).toBe(401);
  });

  it('keeps at least one active admin', async () => {
    const admin = await signIn('admin', ADMIN_PASSWORD);
    const response = await call('/users/admin', { method: 'PATCH', cookie: admin, json: { role: 'member' } });
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ error: { code: 'BAD_REQUEST', message: 'You cannot disable or demote yourself' } });
  });
});
