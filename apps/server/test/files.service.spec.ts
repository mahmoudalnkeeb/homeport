import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../src/activity/activity.service.js';
import type { Database } from '../src/database/database.js';
import { FilesService, kindOf } from '../src/tools/files/files.service.js';
import type { Actor } from '../src/users/users.schema.js';
import { createTestDatabase, testEnv } from './support.js';

const admin: Actor = { id: 'admin-id', username: 'admin', role: 'admin' };
const bob: Actor = { id: 'bob-id', username: 'bob', role: 'member' };
const page = { page: 1, pageSize: 50 };

describe('FilesService', () => {
  let root: string;
  let files: FilesService;
  let activity: ActivityService;
  let db: Database;
  let closeDb: () => Promise<void>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'files-spec-'));
    ({ db, close: closeDb } = await createTestDatabase());
    activity = new ActivityService(db);
    files = new FilesService(testEnv({ DATA_DIR: join(root, 'data'), STATE_DIR: join(root, 'state') }), activity);
    await files.onModuleInit();
  });

  afterEach(async () => {
    await closeDb();
    await rm(root, { recursive: true, force: true });
  });

  const list = (actor: Actor, path: string) => files.list(actor, { path, ...page });

  const data = (...parts: string[]) => join(root, 'data', ...parts);

  it('lists folders first and hides dotfiles', async () => {
    await files.createFolder(admin, 'music');
    await writeFile(data('a.md'), '# hi');
    await writeFile(data('.keep'), '');

    const listing = await list(admin, '');

    expect(listing.items.map((entry) => [entry.name, entry.kind])).toEqual([
      ['music', 'folder'],
      ['users', 'folder'],
      ['a.md', 'markdown'],
    ]);
  });

  describe('member access', () => {
    beforeEach(async () => {
      await mkdir(data('users', 'alice'), { recursive: true });
      await writeFile(data('users', 'alice', 'secret.txt'), 'x');
      await writeFile(data('movie.mp4'), 'v');
    });

    it('reads the library but cannot change it, and never sees the users folder', async () => {
      const listing = await list(bob, '');

      expect(listing.items.map((entry) => entry.name)).toEqual(['movie.mp4']);
      await expect(files.file(bob, 'movie.mp4')).resolves.toMatchObject({ name: 'movie.mp4' });
      await expect(files.createFolder(bob, 'new')).rejects.toThrow('read-only');
      await expect(files.remove(bob, 'movie.mp4')).rejects.toThrow('read-only');
      await expect(files.writeText(bob, 'note.md', 'x')).rejects.toThrow('read-only');
    });

    it("cannot see other people's spaces at all", async () => {
      await expect(list(bob, 'users')).rejects.toThrow('Not found');
      await expect(list(bob, 'users/alice')).rejects.toThrow('Not found');
      await expect(files.file(bob, 'users/alice/secret.txt')).rejects.toThrow('Not found');
      await expect(list(bob, 'users/bob/../alice')).rejects.toThrow('Not found');
    });

    it('owns their personal space, which is created on first visit', async () => {
      const home = await list(bob, 'users/bob');
      await files.writeText(bob, 'users/bob/notes/today.md', '# Today');

      expect(home.items).toEqual([]);
      expect(await readFile(data('users', 'bob', 'notes', 'today.md'), 'utf8')).toBe('# Today');
      await expect(files.remove(bob, 'users/bob')).rejects.toThrow('Personal spaces');
      await expect(files.rename(bob, 'users/bob', 'robert')).rejects.toThrow('Personal spaces');
      await expect(files.remove(admin, 'users')).rejects.toThrow('Personal spaces');
    });

    it('records who made each change', async () => {
      await files.writeText(bob, 'users/bob/a.md', 'x');
      const { items } = await activity.eventsOf('bob', page);
      expect(items[0]).toMatchObject({ action: 'save', detail: 'users/bob/a.md', username: 'bob' });
    });
  });

  it.each(['../outside', '..\\outside', 'a/../../outside'])('rejects paths escaping the data root: %s', async (path) => {
    await expect(list(admin, path)).rejects.toThrow('outside the data directory');
  });

  it('treats a leading slash as relative to the data root', async () => {
    await expect(files.resolve('/etc/passwd')).resolves.toBe(data('etc', 'passwd'));
  });

  it('refuses non-text writes', async () => {
    await expect(files.writeText(admin, 'evil.exe', 'x')).rejects.toThrow('Only text and markdown');
  });

  it('moves uploads into place without overwriting existing files', async () => {
    await writeFile(data('clip.mp4'), 'old');
    const temp = join(root, 'upload-tmp');
    await writeFile(temp, 'new');

    const { items: [saved] } = await files.upload(admin, '', [{ originalname: 'clip.mp4', path: temp }]);

    expect(saved?.name).toBe('clip (1).mp4');
    expect(await readFile(data('clip.mp4'), 'utf8')).toBe('old');
    await expect(stat(temp)).rejects.toThrow();
  });

  it('removes the temp upload even when the member may not write there', async () => {
    const temp = join(root, 'upload-tmp');
    await writeFile(temp, 'x');

    await expect(files.upload(bob, '', [{ originalname: 'a.txt', path: temp }])).rejects.toThrow('read-only');
    await expect(stat(temp)).rejects.toThrow();
  });

  it('renames, refusing collisions and invalid names', async () => {
    await writeFile(data('a.txt'), 'a');
    await writeFile(data('b.txt'), 'b');

    await expect(files.rename(admin, 'a.txt', 'b.txt')).rejects.toThrow('already exists');
    await expect(files.rename(admin, 'a.txt', '../c.txt')).rejects.toThrow('Invalid name');
    expect(await files.rename(admin, 'a.txt', 'c.txt')).toEqual({ path: 'c.txt' });
  });

  it('never deletes the data root', async () => {
    await expect(files.remove(admin, '')).rejects.toThrow('data folder itself');
    await expect(files.remove(admin, 'missing.txt')).rejects.toThrow('Not found');
  });

  it('summarises storage overall, per personal space and by scope', async () => {
    await files.writeText(admin, 'a.md', '1234');
    await writeFile(data('b.mp3'), '12');
    await files.writeText(bob, 'users/bob/n.md', '123');

    const stats = await files.stats();
    const home = await files.homeStats('bob');
    const library = await files.recent(bob, { scope: 'library', ...page });
    const bobNotes = await files.recent(bob, { scope: 'home', kind: 'markdown', ...page });
    const adminNotes = await files.recent(admin, { scope: 'all', kind: 'markdown', page: 1, pageSize: 1 });

    expect(stats).toMatchObject({ totalBytes: 9, files: 3 });
    expect(home).toMatchObject({ totalBytes: 3, files: 1 });
    expect(library.items.map((file) => file.path).sort()).toEqual(['a.md', 'b.mp3']);
    expect(bobNotes.items.map((file) => file.path)).toEqual(['users/bob/n.md']);
    expect(adminNotes.items).toHaveLength(1);
    expect(adminNotes.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect((await files.homeBytes()).get('bob')).toBe(3);
  });
});

describe('kindOf', () => {
  it('classifies by extension, case-insensitively', () => {
    expect(kindOf('Movie.MKV')).toBe('video');
    expect(kindOf('readme')).toBe('other');
  });
});
