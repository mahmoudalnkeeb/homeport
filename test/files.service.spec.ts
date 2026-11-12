import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ActivityService } from '../src/activity/activity.service.js';
import { envSchema } from '../src/config/env.js';
import { FilesService, kindOf } from '../src/tools/files/files.service.js';

describe('FilesService', () => {
  let root: string;
  let files: FilesService;
  let activity: ActivityService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'files-spec-'));
    activity = new ActivityService();
    files = new FilesService(envSchema.parse({ DATA_DIR: root }), activity);
    await files.onModuleInit();
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('lists folders first and hides dotfiles', async () => {
    await files.createFolder('music');
    await writeFile(join(root, 'a.md'), '# hi');
    await writeFile(join(root, '.keep'), '');

    const listing = await files.list('');

    expect(listing.entries.map((entry) => [entry.name, entry.kind])).toEqual([
      ['music', 'folder'],
      ['a.md', 'markdown'],
    ]);
  });

  it.each(['../outside', '..\\outside', 'a/../../outside', '/etc/passwd'])(
    'rejects paths escaping the data root: %s',
    async (path) => {
      if (path === '/etc/passwd') {
        // A leading slash is treated as relative to the root, never as an absolute path.
        await expect(files.resolve(path)).resolves.toBe(join(root, 'etc', 'passwd'));
        return;
      }
      await expect(files.resolve(path)).rejects.toThrow('outside the data directory');
    }
  );

  it('writes markdown and refuses non-text writes', async () => {
    await files.writeText('notes/today.md', '# Today');

    expect(await readFile(join(root, 'notes', 'today.md'), 'utf8')).toBe('# Today');
    await expect(files.writeText('evil.exe', 'x')).rejects.toThrow('Only text and markdown');
  });

  it('moves uploads into place without overwriting existing files', async () => {
    await writeFile(join(root, 'clip.mp4'), 'old');
    const temp = join(root, '.upload-tmp');
    await writeFile(temp, 'new');

    const [saved] = await files.upload('', [{ originalname: 'clip.mp4', path: temp }]);

    expect(saved?.name).toBe('clip (1).mp4');
    expect(await readFile(join(root, 'clip.mp4'), 'utf8')).toBe('old');
    await expect(stat(temp)).rejects.toThrow();
    expect(activity.snapshot().events[0]?.action).toBe('upload');
  });

  it('renames, refusing collisions and invalid names', async () => {
    await writeFile(join(root, 'a.txt'), 'a');
    await writeFile(join(root, 'b.txt'), 'b');

    await expect(files.rename('a.txt', 'b.txt')).rejects.toThrow('already exists');
    await expect(files.rename('a.txt', '../c.txt')).rejects.toThrow('Invalid name');
    expect(await files.rename('a.txt', 'c.txt')).toBe('c.txt');
  });

  it('never deletes the root folder', async () => {
    await expect(files.remove('')).rejects.toThrow('Cannot delete the root folder');
    await expect(files.remove('missing.txt')).rejects.toThrow('Not found');
  });

  it('summarises storage by kind and finds recent markdown', async () => {
    await files.writeText('a.md', '1234');
    await writeFile(join(root, 'b.mp3'), '12');

    const stats = await files.stats();
    const notes = await files.recent('markdown', 5);

    expect(stats).toMatchObject({ totalBytes: 6, files: 2 });
    expect(stats.byKind[0]).toEqual({ kind: 'markdown', bytes: 4, count: 1 });
    expect(notes.files.map((file) => file.path)).toEqual(['a.md']);
  });
});

describe('kindOf', () => {
  it('classifies by extension, case-insensitively', () => {
    expect(kindOf('Movie.MKV')).toBe('video');
    expect(kindOf('readme')).toBe('other');
  });
});
