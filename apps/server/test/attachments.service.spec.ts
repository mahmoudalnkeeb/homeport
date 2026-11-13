import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../src/activity/activity.service.js';
import type { Database } from '../src/database/database.js';
import { MediaService } from '../src/media/media.service.js';
import { AttachmentsService } from '../src/tools/attachments/attachments.service.js';
import { users, type Actor } from '../src/users/users.schema.js';
import { MemoryStorage } from './memory-storage.js';
import { createTestDatabase } from './support.js';

const page = { page: 1, pageSize: 50, mine: false };

describe('AttachmentsService', () => {
  let storage: MemoryStorage;
  let service: AttachmentsService;
  let db: Database;
  let closeDb: () => Promise<void>;
  let admin: Actor;
  let bob: Actor;
  let carol: Actor;

  beforeEach(async () => {
    ({ db, close: closeDb } = await createTestDatabase());
    storage = new MemoryStorage();
    service = new AttachmentsService(db, storage, new MediaService(db, storage), new ActivityService(db));
    const rows = await db
      .insert(users)
      .values(
        (['admin', 'bob', 'carol'] as const).map((username) => ({
          username,
          displayName: username,
          role: username === 'admin' ? ('admin' as const) : ('member' as const),
          passwordHash: 'x',
        }))
      )
      .returning();
    [admin, bob, carol] = rows.map(({ id, username, role }) => ({ id, username, role })) as [Actor, Actor, Actor];
  });

  afterEach(() => closeDb());

  const upload = async (actor: Actor, name: string, body = 'data') => {
    const ticket = await service.startUpload('localhost', { name, size: body.length });
    await storage.upload(ticket, body);
    return service.finishUpload(actor, { target: ticket.target });
  };

  it('files each upload into its type directory and returns a stable link', async () => {
    const video = await upload(bob, 'Intro.MP4');
    const doc = await upload(bob, 'guide.pdf');
    const misc = await upload(carol, 'notes');

    expect(video).toMatchObject({
      name: 'Intro.MP4',
      category: 'video',
      kind: 'video',
      contentType: 'video/mp4',
      owner: 'bob',
      url: `/api/attachments/${video.id}/raw`,
      stream: { status: 'pending' },
    });
    expect(doc).toMatchObject({ category: 'document', stream: null });
    expect(misc.category).toBe('other');
    expect([...storage.objects.keys()].sort()).toEqual(
      [`attachments/document/${doc.id}/guide.pdf`, `attachments/other/${misc.id}/notes`, `attachments/video/${video.id}/Intro.MP4`].sort()
    );
    await expect(service.object(bob, video.id)).resolves.toEqual({ key: `attachments/video/${video.id}/Intro.MP4`, name: 'Intro.MP4' });
  });

  it('filters by category, owner and name, and counts every category', async () => {
    await upload(bob, 'a.mp3');
    await upload(bob, 'b.mp3', 'longer');
    await upload(carol, '100%_done.png');

    const audio = await service.list(bob, { ...page, category: 'audio' });
    const mine = await service.list(carol, { ...page, mine: true });
    const search = await service.list(bob, { ...page, q: '100%' });
    const wildcard = await service.list(bob, { ...page, q: '%' });
    const { items: stats } = await service.categories(bob);

    expect(audio.items.map((item) => item.name).sort()).toEqual(['a.mp3', 'b.mp3']);
    expect(mine.items.map((item) => item.name)).toEqual(['100%_done.png']);
    expect(search.items).toHaveLength(1);
    expect(wildcard.items).toHaveLength(1);
    expect(stats.find((stat) => stat.category === 'audio')).toEqual({ category: 'audio', count: 2, bytes: 10 });
    expect(stats.find((stat) => stat.category === 'video')).toEqual({ category: 'video', count: 0, bytes: 0 });
  });

  it('lets only the owner or an admin rename or delete', async () => {
    const clip = await upload(bob, 'clip.webm');

    await expect(service.rename(carol, clip.id, 'Mine now')).rejects.toThrow('Only the owner or an admin');
    await expect(service.remove(carol, clip.id)).rejects.toThrow('Only the owner or an admin');
    await expect(service.rename(bob, clip.id, 'Holiday clip')).resolves.toMatchObject({ name: 'Holiday clip', filename: 'clip.webm' });

    await service.remove(admin, clip.id);
    expect(storage.objects.size).toBe(0);
    await expect(service.get(admin, clip.id)).rejects.toThrow('Attachment not found');
  });

  it('rejects forged or unfinished upload targets', async () => {
    await expect(service.finishUpload(bob, { target: '../../files/users/carol/x.mp4' })).rejects.toThrow('Invalid upload target');
    await expect(service.finishUpload(bob, { target: '7c9e6679-7425-40de-944b-e07fc1f90ae7/../x' })).rejects.toThrow('Invalid name');
    await expect(service.finishUpload(bob, { target: '7c9e6679-7425-40de-944b-e07fc1f90ae7/x.mp4' })).rejects.toThrow('Upload not found');
  });

  it('pages through the library newest first with accurate totals', async () => {
    for (const name of ['1.png', '2.png', '3.png', '4.png', '5.png']) await upload(bob, name);

    const first = await service.list(carol, { ...page, pageSize: 2 });
    const last = await service.list(carol, { ...page, page: 3, pageSize: 2 });
    const beyond = await service.list(carol, { ...page, page: 4, pageSize: 2 });

    expect(first.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(first.items.map((item) => item.name)).toEqual(['5.png', '4.png']);
    expect(last.items.map((item) => item.name)).toEqual(['1.png']);
    expect(beyond.items).toEqual([]);
  });
});
