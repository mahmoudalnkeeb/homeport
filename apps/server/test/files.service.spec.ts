import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityService } from '../src/activity/activity.service.js';
import type { Database } from '../src/database/database.js';
import { MediaService } from '../src/media/media.service.js';
import { AttachmentsService } from '../src/tools/attachments/attachments.service.js';
import { FilesService } from '../src/tools/files/files.service.js';
import { users, type Actor } from '../src/users/users.schema.js';
import { MemoryStorage } from './memory-storage.js';
import { createTestDatabase, libraryServices } from './support.js';

const page = { page: 1, pageSize: 50 };

describe('FilesService', () => {
  let storage: MemoryStorage;
  let files: FilesService;
  let media: MediaService;
  let activity: ActivityService;
  let attachments: AttachmentsService;
  let admin: Actor;
  let bob: Actor;
  let alice: Actor;
  let db: Database;
  let closeDb: () => Promise<void>;
  let library: ReturnType<typeof libraryServices>;

  beforeEach(async () => {
    ({ db, close: closeDb } = await createTestDatabase());
    storage = new MemoryStorage();
    activity = new ActivityService(db);
    media = new MediaService(db, storage, { add: vi.fn(), addBulk: vi.fn() });
    attachments = new AttachmentsService(db, storage, media, activity);
    library = libraryServices(db, storage, media);
    files = new FilesService(storage, media, activity, attachments, library.watch, library.music);
    const rows = await db
      .insert(users)
      .values(
        (['admin', 'bob', 'alice'] as const).map((username) => ({
          username,
          displayName: username,
          role: username === 'admin' ? ('admin' as const) : ('member' as const),
          passwordHash: 'x',
        }))
      )
      .returning();
    [admin, bob, alice] = rows.map(({ id, username, role }) => ({ id, username, role })) as [Actor, Actor, Actor];
    await files.onModuleInit();
  });

  afterEach(() => closeDb());

  const list = (actor: Actor, path: string) => files.list(actor, { path, ...page });
  const put = (path: string, body = 'x') => storage.put(`files/${path}`, body);
  const upload = async (actor: Actor, folder: string, name: string, body: string) => {
    const ticket = await files.startUpload(actor, 'localhost', { folder, name, size: body.length });
    await storage.upload(ticket, body);
    return files.finishUpload(actor, { target: ticket.target });
  };

  describe('library folders', () => {
    it('indexes uploads under the library roots and skips HLS for music', async () => {
      const movie = await upload(admin, 'library/movies', 'Heat (1995).mp4', 'v');
      const song = await upload(admin, 'library/music', 'song.mp3', 'a');

      expect(movie.stream).not.toBeNull();
      expect(song.stream).toBeNull();
      expect(library.watchQueue.add).toHaveBeenCalledWith('index', { key: 'files/library/movies/Heat (1995).mp4' });
      expect(library.musicQueue.add).toHaveBeenCalledWith('index', { key: 'files/library/music/song.mp3' });
    });

    it('forgets and re-indexes library files on rename and delete', async () => {
      await upload(admin, 'library/music/Old', 'song.mp3', 'a');
      await library.music.saveTrack('files/library/music/Old/song.mp3', { title: 's', artist: 'a', albumArtist: 'a', album: 'Old', trackNo: null, discNo: null, year: null }, 1);

      await files.rename(admin, 'library/music/Old', 'New');
      expect((await library.music.tracks(page)).items).toEqual([]);
      expect(library.musicQueue.add).toHaveBeenLastCalledWith('index', { key: 'files/library/music/New/song.mp3' });

      await library.music.saveTrack('files/library/music/New/song.mp3', { title: 's', artist: 'a', albumArtist: 'a', album: 'New', trackNo: null, discNo: null, year: null }, 1);
      await files.remove(admin, 'library/music/New/song.mp3');
      expect((await library.music.tracks(page)).items).toEqual([]);
    });
  });

  it('lists folders first, including implicit ones, and hides dotfiles', async () => {
    await files.createFolder(admin, 'music');
    await put('a.md', '# hi');
    await put('.keep');
    await put('video/clip.mp4');

    const listing = await list(admin, '');

    expect(listing.items.map((entry) => [entry.name, entry.kind])).toEqual([
      ['music', 'folder'],
      ['users', 'folder'],
      ['video', 'folder'],
      ['a.md', 'markdown'],
    ]);
    await expect(list(admin, 'a.md')).rejects.toThrow('Not a folder');
    await expect(list(admin, 'missing')).rejects.toThrow('Not found');
  });

  describe('member access', () => {
    beforeEach(async () => {
      await put('users/alice/secret.txt');
      await put('movie.mp4', 'v');
    });

    it('reads the library but cannot change it, and never sees the users folder', async () => {
      const listing = await list(bob, '');

      expect(listing.items.map((entry) => entry.name)).toEqual(['movie.mp4']);
      await expect(files.file(bob, 'movie.mp4')).resolves.toEqual({ key: 'files/movie.mp4', name: 'movie.mp4' });
      await expect(files.createFolder(bob, 'new')).rejects.toThrow('read-only');
      await expect(files.remove(bob, 'movie.mp4')).rejects.toThrow('read-only');
      await expect(files.writeText(bob, 'note.md', 'x')).rejects.toThrow('read-only');
      await expect(files.startUpload(bob, 'localhost', { folder: '', name: 'a.mp4', size: 1 })).rejects.toThrow('read-only');
    });

    it('cannot see other spaces at all', async () => {
      await expect(list(bob, 'users')).rejects.toThrow('Not found');
      await expect(list(bob, 'users/alice')).rejects.toThrow('Not found');
      await expect(files.file(bob, 'users/alice/secret.txt')).rejects.toThrow('Not found');
    });

    it('owns their personal space, which is created on first visit', async () => {
      const home = await list(bob, 'users/bob');
      await files.writeText(bob, 'users/bob/notes/today.md', '# Today');

      expect(home.items).toEqual([]);
      expect(storage.objects.get('files/users/bob/notes/today.md')?.body.toString()).toBe('# Today');
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

  it.each(['../outside', '..\\outside', 'a/../../outside', 'users/bob/../alice'])('rejects relative segments: %s', async (path) => {
    await expect(list(admin, path)).rejects.toThrow('Invalid path');
  });

  it('refuses non-text writes', async () => {
    await expect(files.writeText(admin, 'evil.exe', 'x')).rejects.toThrow('Only text and markdown');
  });

  it('uploads beside existing files without overwriting them, even while another upload is pending', async () => {
    await put('clip.mp4', 'old');

    const pending = await files.startUpload(admin, 'localhost', { folder: '', name: 'clip.mp4', size: 3 });
    const saved = await upload(admin, '', 'clip.mp4', 'new');

    expect(pending.target).toBe('clip (1).mp4');
    expect(saved).toMatchObject({ name: 'clip (2).mp4', kind: 'video', size: 3, stream: { status: 'pending', playlist: null } });
    expect(storage.objects.get('files/clip.mp4')?.body.toString()).toBe('old');
    await expect(files.finishUpload(admin, { target: 'never-sent.txt' })).rejects.toThrow('Upload not found');
  });

  it('attaches stream status to listed media only', async () => {
    await upload(admin, 'video', 'a.mp4', 'v');
    await upload(admin, 'video', 'b.txt', 't');

    const { items } = await list(admin, 'video');

    expect(items.find((entry) => entry.name === 'a.mp4')?.stream).toMatchObject({ status: 'pending' });
    expect(items.find((entry) => entry.name === 'b.txt')).not.toHaveProperty('stream');
  });

  it('renames files and whole folders, carrying their streams along', async () => {
    await upload(admin, 'shows/s1', 'ep1.mkv', 'v');
    await put('a.txt', 'a');
    await put('b.txt', 'b');

    await expect(files.rename(admin, 'a.txt', 'b.txt')).rejects.toThrow('already exists');
    await expect(files.rename(admin, 'a.txt', '../c.txt')).rejects.toThrow('Invalid name');
    await expect(files.rename(admin, 'a.txt', 'c\\d.txt')).rejects.toThrow('Invalid name');
    expect(await files.rename(admin, 'a.txt', 'c.txt')).toEqual({ path: 'c.txt' });
    expect(await files.rename(admin, 'shows', 'series')).toEqual({ path: 'series' });

    expect([...storage.objects.keys()].filter((key) => key.includes('ep1'))).toEqual(['files/series/s1/ep1.mkv']);
    expect((await media.streamsFor(['files/series/s1/ep1.mkv'])).size).toBe(1);
  });

  it('deletes folders with everything inside, including derived streams', async () => {
    await upload(admin, 'shows', 'ep1.mkv', 'v');
    const [stream] = (await media.streamsFor(['files/shows/ep1.mkv'])).values();
    await storage.put(`streams/${stream?.id}/master.m3u8`, '#EXTM3U');

    await files.remove(admin, 'shows');

    expect([...storage.objects.keys()].filter((key) => key.includes('shows') || key.startsWith('streams/'))).toEqual([]);
    expect((await media.streamsFor(['files/shows/ep1.mkv'])).size).toBe(0);
  });

  it('never deletes the library root', async () => {
    await expect(files.remove(admin, '')).rejects.toThrow('library root');
    await expect(files.remove(admin, 'missing.txt')).rejects.toThrow('Not found');
  });

  it('summarises storage overall, per personal space and by scope', async () => {
    await files.writeText(admin, 'a.md', '1234');
    await put('b.mp3', '12');
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

  describe('attachments', () => {
    const everyone = { page: 1, pageSize: 50, mine: false };
    const names = async (actor: Actor) => (await attachments.list(actor, everyone)).items.map((item) => item.path);

    it('registers every upload as an attachment and keeps it in step with the file', async () => {
      const saved = await upload(admin, 'docs', 'guide.pdf', 'pdf!');
      const [linked] = (await attachments.list(admin, everyone)).items;
      const id = linked?.id ?? '';

      expect(saved.path).toBe('docs/guide.pdf');
      expect(linked).toMatchObject({ name: 'guide.pdf', category: 'document', path: 'docs/guide.pdf', size: 4, owner: 'admin' });
      await expect(attachments.object(admin, id)).resolves.toEqual({ key: 'files/docs/guide.pdf', name: 'guide.pdf' });
      expect(storage.objects.size).toBe(2);

      await files.rename(admin, 'docs/guide.pdf', 'manual.pdf');
      await files.rename(admin, 'docs', 'reference');
      expect(await attachments.get(admin, id)).toMatchObject({ name: 'manual.pdf', path: 'reference/manual.pdf' });

      await expect(attachments.remove(admin, id)).rejects.toThrow('lives in Files');
      await files.remove(admin, 'reference');
      await expect(attachments.get(admin, id)).rejects.toThrow('Attachment not found');
    });

    it('tracks the new size when an uploaded text file is edited', async () => {
      await upload(bob, 'users/bob', 'a.md', 'x');
      await files.writeText(bob, 'users/bob/a.md', 'longer');
      expect((await attachments.list(bob, everyone)).items[0]?.size).toBe(6);
    });

    it('keeps personal uploads private to their space', async () => {
      const secret = await upload(alice, 'users/alice', 'secret.mp4', 'v');
      await upload(admin, '', 'shared.png', 'i');
      const [item] = (await attachments.list(alice, everyone)).items.filter((entry) => entry.path === secret.path);
      const id = item?.id ?? '';

      expect(await names(bob)).toEqual(['shared.png']);
      expect((await names(alice)).sort()).toEqual(['shared.png', 'users/alice/secret.mp4']);
      expect((await names(admin)).sort()).toEqual(['shared.png', 'users/alice/secret.mp4']);
      await expect(attachments.get(bob, id)).rejects.toThrow('Attachment not found');
      await expect(attachments.object(bob, id)).rejects.toThrow('Attachment not found');
      await expect(attachments.rename(bob, id, 'mine')).rejects.toThrow('Attachment not found');
      await expect(attachments.remove(bob, id)).rejects.toThrow('Attachment not found');
      expect((await attachments.categories(bob)).items.find((stat) => stat.category === 'video')?.count).toBe(0);
      expect((await attachments.summary(bob)).tiles[0]).toEqual({ label: 'Attachments', value: '1' });
    });

    it('does not treat a lookalike username as the same space', async () => {
      await db.insert(users).values({ username: 'bobby', displayName: 'bobby', role: 'member', passwordHash: 'x' });
      await put('users/bobby/x.txt');
      await attachments.track(admin, 'files/users/bobby/x.txt', 1);
      expect(await names(bob)).toEqual([]);
    });

    it('drops the attachments of a removed personal space', async () => {
      await upload(alice, 'users/alice', 'a.txt', 'a');
      await files.removeHome('alice');
      expect(await names(admin)).toEqual([]);
    });
  });

  describe('upload isolation', () => {
    const attempts = [
      'users/alice',
      'users/alice/deep',
      '/users/alice',
      'users//alice',
      'users\\alice',
      'users/bob/../alice',
      'users/bob/../../users/alice',
      '../users/alice',
      'users/./alice',
      'USERS/alice',
      'users',
      '',
    ];

    it.each(attempts)('a member cannot upload into folder %j', async (folder) => {
      await expect(files.startUpload(bob, 'localhost', { folder, name: 'x.txt', size: 1 })).rejects.toThrow(
        /Not found|Invalid path|read-only/
      );
    });

    it.each(['../x.txt', 'a/b.txt', 'a\\b.txt', '..', '.', 'x\u0000.txt'])('rejects the file name %j', async (name) => {
      await expect(files.startUpload(bob, 'localhost', { folder: 'users/bob', name, size: 1 })).rejects.toThrow('Invalid name');
    });

    it('cannot finish or abort an upload outside the own space', async () => {
      await put('users/alice/secret.txt', 'top secret');
      for (const target of [
        'users/alice/secret.txt',
        '/users/alice/secret.txt',
        'users/bob/../alice/secret.txt',
        'users\\alice\\secret.txt',
      ]) {
        await expect(files.finishUpload(bob, { target })).rejects.toThrow(/Not found|Invalid path/);
        await expect(files.abortUpload(bob, { target, uploadId: 'u' })).rejects.toThrow(/Not found|Invalid path/);
      }
      expect(await attachments.list(admin, { page: 1, pageSize: 50, mine: false })).toMatchObject({ meta: { total: 0 } });
    });

    it('keeps an upload inside the own space and signs only that key', async () => {
      const ticket = await files.startUpload(bob, 'localhost', { folder: 'users/bob/notes', name: 'a.txt', size: 1 });
      expect(ticket.target).toBe('users/bob/notes/a.txt');
      expect(ticket.partUrls.every((url) => decodeURIComponent(url).includes('files/users/bob/notes/a.txt'))).toBe(true);
    });
  });
});
