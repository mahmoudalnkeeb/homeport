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

describe('HTTP API', () => {
  let app: NestNodeApplication;
  let base: string;
  let dir: string;
  let closeDb: () => Promise<void>;
  const storage = new MemoryStorage();
  const ADMIN_PASSWORD = 'admin-password-1';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'http-spec-'));
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
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter(), { logger: false });
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
        ...(csrf ? { 'X-Homeport-Request': '1' } : {}),
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

  it('redirects media to signed storage URLs and proxies text and active content itself', async () => {
    const admin = await signIn('admin', ADMIN_PASSWORD);
    await storage.put('files/video/clip one.mp4', '0123456789');
    await storage.put('files/notes/a.md', '# Notes');
    await storage.put('files/art/logo.svg', '<svg/>');
    const raw = (path: string, query = '') =>
      fetch(`${base}/files/raw?path=${encodeURIComponent(path)}${query}`, { headers: { Cookie: admin }, redirect: 'manual' });

    const inline = await raw('video/clip one.mp4');
    expect(inline.status).toBe(302);
    expect(inline.headers.get('location')).toBe(
      `http://127.0.0.1:9000/files/video/clip%20one.mp4?disposition=${encodeURIComponent("inline; filename*=UTF-8''clip%20one.mp4")}`
    );
    const download = await raw('video/clip one.mp4', '&download=true');
    expect(download.headers.get('location')).toContain(encodeURIComponent('attachment;'));

    const markdown = await raw('notes/a.md');
    expect(markdown.status).toBe(200);
    expect(markdown.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await markdown.text()).toBe('# Notes');
    expect((await raw('art/logo.svg')).headers.get('content-security-policy')).toBe('sandbox');

    const missing = await call('/files/raw?path=video/none.mp4', { cookie: admin });
    expect(missing.status).toBe(404);
    expect(await body(missing)).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('runs the attachment upload handshake and serves stable links', async () => {
    const admin = await signIn('admin', ADMIN_PASSWORD);
    const ticket = (await body(await call('/attachments/uploads', { method: 'POST', cookie: admin, json: { name: 'song.mp3', size: 4 } })))
      .data as { target: string; uploadId: string | null; contentType: string; partUrls: string[] };
    expect(ticket).toMatchObject({ uploadId: null, contentType: 'audio/mpeg', partUrls: [expect.any(String)] });
    await storage.upload({ ...ticket, partSize: 4 }, 'tune');

    const finished = await call('/attachments/uploads/finish', { method: 'POST', cookie: admin, json: { target: ticket.target } });
    expect(finished.status).toBe(201);
    const { data: attachment } = (await body(finished)) as { data: { id: string; url: string; category: string } };
    expect(attachment).toMatchObject({ category: 'audio', url: `/api/attachments/${attachment.id}/raw` });

    const link = await fetch(`http://127.0.0.1:${new URL(base).port}${attachment.url}`, { headers: { Cookie: admin }, redirect: 'manual' });
    expect(link.status).toBe(302);
    expect((await call('/attachments/not-a-uuid', { cookie: admin })).status).toBe(422);
    expect(await body(await call('/attachments?category=audio', { cookie: admin }))).toMatchObject({ meta: { total: 1 } });
  });

  it('keeps at least one active admin', async () => {
    const admin = await signIn('admin', ADMIN_PASSWORD);
    const response = await call('/users/admin', { method: 'PATCH', cookie: admin, json: { role: 'member' } });
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ error: { code: 'BAD_REQUEST', message: 'You cannot disable or demote yourself' } });
  });
});
