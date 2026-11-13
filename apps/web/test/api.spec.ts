import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, rawUrl, SESSION_EXPIRED } from '../src/api';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const respond = (status: number, body?: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(status, body));

const failure = (status: number, code: string, message: string, details?: { field: string; message: string }[]) => ({
  error: { status, code, message, ...(details ? { details } : {}) },
});

afterEach(() => vi.restoreAllMocks());

describe('rawUrl', () => {
  it('encodes paths and adds the download flag', () => {
    expect(rawUrl('video/My Clip #1.mp4')).toBe('/api/files/raw?path=video%2FMy%20Clip%20%231.mp4');
    expect(rawUrl('a.md', true)).toBe('/api/files/raw?path=a.md&download=true');
  });
});

describe('api', () => {
  it('sends JSON bodies and unwraps { data }', async () => {
    const fetch = respond(200, { data: { path: 'notes/b.md' } });

    await expect(api.files.rename({ path: 'notes/a.md', name: 'b.md' })).resolves.toEqual({ path: 'notes/b.md' });
    expect(fetch).toHaveBeenCalledWith('/api/files/rename', {
      method: 'POST',
      headers: { 'X-Homelab-Request': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'notes/a.md', name: 'b.md' }),
    });
  });

  it('returns list pages with their meta', async () => {
    const fetch = respond(200, { data: [{ detail: 'a' }], meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 } });

    await expect(api.events({ page: 2, pageSize: 1 })).resolves.toEqual({
      items: [{ detail: 'a' }],
      meta: { page: 2, pageSize: 1, total: 3, totalPages: 3 },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/activity/events?page=2&pageSize=1');
  });

  it('collects every page of a folder', async () => {
    const page = (n: number) => ({ data: [{ name: `f${n}` }], meta: { page: n, pageSize: 200, total: 3, totalPages: 3 } });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => Promise.resolve(json(200, page(Number(/page=(\d+)/.exec(String(input))?.[1])))));

    const entries = await api.files.list('music');

    expect(entries.map((entry) => entry.name)).toEqual(['f1', 'f2', 'f3']);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('announces an expired session on 401, except for the sign-in calls themselves', async () => {
    const listener = vi.fn();
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    target.addEventListener(SESSION_EXPIRED, listener);

    respond(401, failure(401, 'UNAUTHENTICATED', 'Sign in required'));
    await expect(api.files.list('')).rejects.toThrow('Sign in required');
    respond(401, failure(401, 'UNAUTHENTICATED', 'Wrong username or password'));
    await expect(api.auth.login({ username: 'a', password: 'b' })).rejects.toThrow('Wrong');

    expect(listener).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('resolves { data: null } for actions without a result', async () => {
    respond(200, { data: null });
    await expect(api.files.remove('old.txt')).resolves.toBeNull();
  });

  it('surfaces the error code, and the first field message for validation failures', async () => {
    respond(422, failure(422, 'VALIDATION_FAILED', 'Invalid request', [{ field: 'password', message: 'At least 8 characters' }]));
    const error = await api.users.resetPassword('bob', 'x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: 'At least 8 characters', status: 422, code: 'VALIDATION_FAILED' });
  });

  it('falls back to the status line for non-JSON errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(api.system()).rejects.toThrow('502 Bad Gateway');
  });
});
