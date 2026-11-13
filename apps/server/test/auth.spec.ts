import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pathAccess } from '@homeport/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../src/activity/activity.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import type { Database } from '../src/database/database.js';
import { MediaService } from '../src/media/media.service.js';
import { sessions } from '../src/sessions/sessions.schema.js';
import { SessionsService } from '../src/sessions/sessions.service.js';
import { AttachmentsService } from '../src/tools/attachments/attachments.service.js';
import { FilesService } from '../src/tools/files/files.service.js';
import { hashPassword, verifyPassword } from '../src/users/password.js';
import type { Actor } from '../src/users/users.schema.js';
import { UsersService } from '../src/users/users.service.js';
import { MemoryStorage } from './memory-storage.js';
import { createTestDatabase, testEnv } from './support.js';

describe('passwords', () => {
  it('verifies the right password only, with a fresh salt each time', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');

    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong horse', a)).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});

describe('pathAccess', () => {
  const bob = { username: 'bob', role: 'member' as const };
  it.each([
    ['', 'read'],
    ['movies/a.mp4', 'read'],
    ['users', 'none'],
    ['users/alice/x', 'none'],
    ['users/bob', 'write'],
    ['users/bob/notes/a.md', 'write'],
  ])('member: %s -> %s', (path, expected) => {
    expect(pathAccess(bob, path)).toBe(expected);
  });

  it('admins may write anywhere', () => {
    expect(pathAccess({ username: 'admin', role: 'admin' }, 'users/alice/x')).toBe('write');
  });
});

describe('AuthService + UsersService', () => {
  let dir: string;
  let db: Database;
  let closeDb: () => Promise<void>;

  const make = async (env: Record<string, string> = {}) => {
    const config = testEnv({ STATE_DIR: join(dir, 'state'), ...env });
    const activity = new ActivityService(db);
    const storage = new MemoryStorage();
    const media = new MediaService(db, storage);
    const files = new FilesService(storage, media, activity, new AttachmentsService(db, storage, media, activity));
    await files.onModuleInit();
    const sessionStore = new SessionsService(db, config);
    const users = new UsersService(db, config, sessionStore, files, activity);
    const auth = new AuthService(users, sessionStore);
    await users.onApplicationBootstrap();
    await auth.onApplicationBootstrap();
    return { auth, users };
  };

  const actorOf = async (users: UsersService, username: string): Promise<Actor> => {
    const user = await users.findByUsername(username);
    if (!user) throw new Error(`no ${username}`);
    return user;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'auth-spec-'));
    ({ db, close: closeDb } = await createTestDatabase());
  });
  afterEach(async () => {
    await closeDb();
    await rm(dir, { recursive: true, force: true });
  });

  it('bootstraps an admin with a one-time password written to the state folder', async () => {
    const { auth } = await make();
    const file = await readFile(join(dir, 'state', 'initial-admin-password.txt'), 'utf8');
    const password = /password: (\S+)/.exec(file)?.[1] ?? '';

    const { token, user } = await auth.login('admin', password, 'ip');

    expect(user).toMatchObject({ role: 'admin', mustChangePassword: true });
    expect((await auth.sessionUser(token))?.username).toBe('admin');
  });

  it('uses ADMIN_PASSWORD when provided, without forcing a change', async () => {
    const { auth } = await make({ ADMIN_PASSWORD: 'chosen-password' });
    const { user } = await auth.login('admin', 'chosen-password', 'ip');
    expect(user.mustChangePassword).toBe(false);
  });

  it('keeps sessions across restarts, storing only token hashes', async () => {
    const first = await make({ ADMIN_PASSWORD: 'chosen-password' });
    const { token } = await first.auth.login('admin', 'chosen-password', 'ip');

    const second = await make({ ADMIN_PASSWORD: 'ignored-now' });
    const stored = await db.select().from(sessions);

    expect((await second.auth.sessionUser(token))?.username).toBe('admin');
    expect(stored.map((row) => row.id)).not.toContain(token);
  });

  it('throttles repeated failures and hides whether a user exists', async () => {
    const { auth } = await make({ ADMIN_PASSWORD: 'chosen-password' });

    await expect(auth.login('ghost', 'x', 'ip')).rejects.toThrow('Wrong username or password');
    for (let i = 0; i < 5; i++) await expect(auth.login('admin', 'nope', 'ip')).rejects.toThrow('Wrong');
    await expect(auth.login('admin', 'chosen-password', 'ip')).rejects.toThrow('Too many failed sign-ins');
    await expect(auth.login('admin', 'chosen-password', 'other-ip')).resolves.toBeDefined();
  });

  it('signs a user out everywhere when disabled or reset', async () => {
    const { auth, users } = await make({ ADMIN_PASSWORD: 'chosen-password' });
    const admin = await actorOf(users, 'admin');
    await users.create(admin, { username: 'bob', displayName: 'Bob', role: 'member', password: 'temporary-1' });
    const bob = await auth.login('bob', 'temporary-1', 'ip');
    await auth.changePassword(bob.user, 'temporary-1', 'bob-password', bob.token);

    await users.update(admin, 'bob', { disabled: true });
    expect(await auth.sessionUser(bob.token)).toBeNull();
    await expect(auth.login('bob', 'bob-password', 'ip')).rejects.toThrow('disabled');

    await users.update(admin, 'bob', { disabled: false });
    const again = await auth.login('bob', 'bob-password', 'ip');
    await users.resetPassword(admin, 'bob', 'temporary-2');
    expect(await auth.sessionUser(again.token)).toBeNull();
    const { user } = await auth.login('bob', 'temporary-2', 'ip');
    expect(user.mustChangePassword).toBe(true);
  });

  it('changing your own password keeps this session and ends the others', async () => {
    const { auth } = await make({ ADMIN_PASSWORD: 'chosen-password' });
    const here = await auth.login('admin', 'chosen-password', 'ip');
    const there = await auth.login('admin', 'chosen-password', 'ip');

    await expect(auth.changePassword(here.user, 'wrong', 'new-password-1', here.token)).rejects.toThrow('Current password');
    await auth.changePassword(here.user, 'chosen-password', 'new-password-1', here.token);

    expect(await auth.sessionUser(here.token)).not.toBeNull();
    expect(await auth.sessionUser(there.token)).toBeNull();
  });

  it('always keeps one active admin and stops self-lockout', async () => {
    const { users } = await make({ ADMIN_PASSWORD: 'chosen-password' });
    const admin = await actorOf(users, 'admin');

    await expect(users.update(admin, 'admin', { role: 'member' })).rejects.toThrow('yourself');
    await expect(users.remove(admin, 'admin', false)).rejects.toThrow('your own account');
    await users.create(admin, { username: 'root2', displayName: 'Second', role: 'admin', password: 'second-pass' });
    const root2 = await actorOf(users, 'root2');
    await expect(users.update(root2, 'admin', { disabled: true })).resolves.toBeDefined();
    await expect(users.update(admin, 'root2', { disabled: true })).rejects.toThrow('at least one active admin');
    await expect(users.update(admin, 'root2', {})).rejects.toThrow('Nothing to update');
  });

  it('lists users a page at a time, admins first', async () => {
    const { users } = await make({ ADMIN_PASSWORD: 'chosen-password' });
    const admin = await actorOf(users, 'admin');
    for (const name of ['zed', 'amy', 'kim']) {
      await users.create(admin, { username: name, displayName: name, role: 'member', password: 'temporary-1' });
    }

    const first = await users.list({ page: 1, pageSize: 2 });
    const second = await users.list({ page: 2, pageSize: 2 });

    expect(first.items.map((user) => user.username)).toEqual(['admin', 'amy']);
    expect(second.items.map((user) => user.username)).toEqual(['kim', 'zed']);
    expect(second.meta).toEqual({ page: 2, pageSize: 2, total: 4, totalPages: 2 });
  });
});
