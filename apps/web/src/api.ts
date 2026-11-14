import type {
  ActivityEvent,
  Album,
  AlbumDetail,
  AlbumQuery,
  Artist,
  LibraryQuery,
  MusicTrack,
  RescanResult,
  Show,
  ShowDetail,
  Video,
  WatchProgress,
  WatchProgressBody,
  ActivitySnapshot,
  ApiErrorDetail,
  ApiErrorResponse,
  ApiListResponse,
  ApiResponse,
  Attachment,
  AttachmentCategoryStats,
  AttachmentQuery,
  ChangePasswordBody,
  CreateUserBody,
  ErrorCode,
  FileEntry,
  LoginBody,
  Me,
  PageViewBody,
  PaginationMeta,
  PaginationQuery,
  RecentQuery,
  RenameBody,
  RenameResult,
  SystemSnapshot,
  ToolInfo,
  ToolSummary,
  UpdateUserBody,
  UploadTicket,
  UserInfo,
  UserStats,
  WriteTextBody,
} from '@homeport/contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ErrorCode | undefined = undefined,
    readonly details: ApiErrorDetail[] = []
  ) {
    super(message);
  }
}

export interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

export const SESSION_EXPIRED = 'homeport:session-expired';

const REQUEST_HEADER = { 'X-Homeport-Request': '1' };
const MAX_PAGE_SIZE = 200;

function isErrorResponse(body: unknown): body is ApiErrorResponse {
  return typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'object' && body.error !== null;
}

function toApiError(status: number, statusText: string, body: unknown): ApiError {
  if (!isErrorResponse(body)) return new ApiError(`${status} ${statusText}`, status);
  const { message, code, details } = body.error;
  const first = details?.[0];
  return new ApiError(code === 'VALIDATION_FAILED' && first ? first.message : message, status, code, details ?? []);
}

async function send(path: string, init: RequestInit & { json?: unknown }): Promise<unknown> {
  const { json, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: { ...REQUEST_HEADER, ...(json === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/me') {
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
    throw toApiError(response.status, response.statusText, body);
  }
  return body;
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  return ((await send(path, init)) as ApiResponse<T>).data;
}

async function requestPage<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<Page<T>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  const separator = path.includes('?') ? '&' : '?';
  const body = (await send(params.size ? `${path}${separator}${params}` : path, {})) as ApiListResponse<T>;
  return { items: body.data, meta: body.meta };
}

async function allPages<T>(load: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const first = await load(1);
  const rest = await Promise.all(Array.from({ length: Math.max(first.meta.totalPages - 1, 0) }, (_, i) => load(i + 2)));
  return [first, ...rest].flatMap((page) => page.items);
}

const q = (path: string) => encodeURIComponent(path);

export const rawUrl = (path: string, download = false) => `/api/files/raw?path=${q(path)}${download ? '&download=true' : ''}`;

export const api = {
  auth: {
    me: () => request<Me>('/api/auth/me'),
    login: (body: LoginBody) => request<Me>('/api/auth/login', { method: 'POST', json: body }),
    logout: () => request<null>('/api/auth/logout', { method: 'POST' }),
    changePassword: (body: ChangePasswordBody) => request<Me>('/api/auth/password', { method: 'POST', json: body }),
  },
  users: {
    all: () => allPages((page) => requestPage<UserInfo>('/api/users', { page, pageSize: MAX_PAGE_SIZE })),
    page: (query: PaginationQuery) => requestPage<UserInfo>('/api/users', { ...query }),
    stats: () => request<UserStats>('/api/users/stats'),
    create: (body: CreateUserBody) => request<UserInfo>('/api/users', { method: 'POST', json: body }),
    update: (username: string, body: UpdateUserBody) => request<UserInfo>(`/api/users/${q(username)}`, { method: 'PATCH', json: body }),
    resetPassword: (username: string, password: string) =>
      request<null>(`/api/users/${q(username)}/password`, { method: 'POST', json: { password } }),
    remove: (username: string, deleteFiles: boolean) =>
      request<null>(`/api/users/${q(username)}?deleteFiles=${deleteFiles}`, { method: 'DELETE' }),
  },

  tools: async () => (await requestPage<ToolInfo>('/api/tools')).items,
  system: () => request<SystemSnapshot>('/api/system'),
  activity: () => request<ActivitySnapshot>('/api/activity'),
  events: (query: PaginationQuery = {}) => requestPage<ActivityEvent>('/api/activity/events', { ...query }),
  myActivity: (query: PaginationQuery = {}) => requestPage<ActivityEvent>('/api/activity/mine', { ...query }),
  pageView: (body: PageViewBody) => request<null>('/api/activity/pageview', { method: 'POST', json: body }),
  summary: (url: string) => request<ToolSummary>(url),

  files: {
    list: (path: string) => allPages((page) => requestPage<FileEntry>('/api/files', { path, page, pageSize: MAX_PAGE_SIZE })),
    recent: ({ scope, kind, page, pageSize }: RecentQuery) => requestPage<FileEntry>('/api/files/recent', { scope, kind, page, pageSize }),
    text: async (path: string) => {
      const response = await fetch(rawUrl(path));
      if (!response.ok) throw new ApiError(response.status === 404 ? 'File not found' : `Could not open ${path}`, response.status);
      return response.text();
    },
    writeText: (body: WriteTextBody) => request<FileEntry>('/api/files/text', { method: 'PUT', json: body }),
    createFolder: (path: string) => request<null>('/api/files/folder', { method: 'POST', json: { path } }),
    rename: (body: RenameBody) => request<RenameResult>('/api/files/rename', { method: 'POST', json: body }),
    remove: (path: string) => request<null>(`/api/files?path=${q(path)}`, { method: 'DELETE' }),
  },

  attachments: {
    page: ({ category, q: search, mine, page, pageSize }: AttachmentQuery) =>
      requestPage<Attachment>('/api/attachments', { category, q: search, mine: mine ? 'true' : undefined, page, pageSize }),
    get: (id: string) => request<Attachment>(`/api/attachments/${q(id)}`),
    categories: async () => (await requestPage<AttachmentCategoryStats>('/api/attachments/categories')).items,
    rename: (id: string, name: string) => request<Attachment>(`/api/attachments/${q(id)}`, { method: 'PATCH', json: { name } }),
    remove: (id: string) => request<null>(`/api/attachments/${q(id)}`, { method: 'DELETE' }),
  },

  watch: {
    movies: ({ q: search, page, pageSize }: LibraryQuery) => requestPage<Video>('/api/watch/movies', { q: search, page, pageSize }),
    shows: ({ q: search, page, pageSize }: LibraryQuery) => requestPage<Show>('/api/watch/shows', { q: search, page, pageSize }),
    show: (id: string) => request<ShowDetail>(`/api/watch/shows/${q(id)}`),
    continueWatching: async () => (await requestPage<Video>('/api/watch/continue')).items,
    saveProgress: (id: string, body: WatchProgressBody) =>
      request<WatchProgress>(`/api/watch/progress/${q(id)}`, { method: 'PUT', json: body, keepalive: true }),
    rescan: () => request<RescanResult>('/api/watch/rescan', { method: 'POST' }),
  },

  music: {
    albums: ({ q: search, artist, page, pageSize }: AlbumQuery) =>
      requestPage<Album>('/api/music/albums', { q: search, artist, page, pageSize }),
    album: (id: string) => request<AlbumDetail>(`/api/music/albums/${q(id)}`),
    artists: ({ q: search, page, pageSize }: LibraryQuery) => requestPage<Artist>('/api/music/artists', { q: search, page, pageSize }),
    tracks: ({ q: search, page, pageSize }: LibraryQuery) => requestPage<MusicTrack>('/api/music/tracks', { q: search, page, pageSize }),
    rescan: () => request<RescanResult>('/api/music/rescan', { method: 'POST' }),
  },
};

const PART_CONCURRENCY = 4;
const PART_ATTEMPTS = 3;

function putPart(url: string, body: Blob, contentType: string | null, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.addEventListener('progress', (event) => onProgress(event.loaded));
    xhr.addEventListener('load', () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(`Storage rejected the upload (${xhr.status})`, xhr.status))
    );
    xhr.addEventListener('error', () => reject(new ApiError('Upload failed: storage unreachable', 0)));
    xhr.send(body);
  });
}

async function sendParts(ticket: UploadTicket, file: File, onProgress: (loaded: number) => void): Promise<void> {
  const loaded = ticket.partUrls.map(() => 0);
  const report = () => onProgress(loaded.reduce((sum, value) => sum + value, 0));
  let next = 0;
  const worker = async () => {
    while (next < ticket.partUrls.length) {
      const index = next++;
      const url = ticket.partUrls[index];
      if (!url) return;
      const blob = file.slice(index * ticket.partSize, (index + 1) * ticket.partSize);
      for (let attempt = 1; ; attempt++) {
        try {
          await putPart(url, blob, ticket.uploadId ? null : ticket.contentType, (bytes) => {
            loaded[index] = bytes;
            report();
          });
          break;
        } catch (error) {
          loaded[index] = 0;
          if (attempt >= PART_ATTEMPTS) throw error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, ticket.partUrls.length) }, worker));
}

async function uploadObject<T>(base: string, extra: Record<string, string>, file: File, onProgress: (loaded: number) => void): Promise<T> {
  const ticket = await request<UploadTicket>(`${base}/uploads`, { method: 'POST', json: { ...extra, name: file.name, size: file.size } });
  const handle = { target: ticket.target, ...(ticket.uploadId ? { uploadId: ticket.uploadId } : {}) };
  try {
    await sendParts(ticket, file, onProgress);
  } catch (error) {
    await request<null>(`${base}/uploads/abort`, { method: 'POST', json: handle }).catch(() => undefined);
    throw error;
  }
  return request<T>(`${base}/uploads/finish`, { method: 'POST', json: handle });
}

async function uploadAll<T>(files: File[], onProgress: (ratio: number) => void, send: (file: File, onLoaded: (bytes: number) => void) => Promise<T>) {
  const total = files.reduce((sum, file) => sum + file.size, 0) || 1;
  let done = 0;
  const saved: T[] = [];
  for (const file of files) {
    saved.push(await send(file, (bytes) => onProgress((done + bytes) / total)));
    done += file.size;
    onProgress(done / total);
  }
  return saved;
}

export const uploadFiles = (folder: string, files: File[], onProgress: (ratio: number) => void): Promise<FileEntry[]> =>
  uploadAll(files, onProgress, (file, onLoaded) => uploadObject<FileEntry>('/api/files', { folder }, file, onLoaded));

export const uploadAttachments = (files: File[], onProgress: (ratio: number) => void): Promise<Attachment[]> =>
  uploadAll(files, onProgress, (file, onLoaded) => uploadObject<Attachment>('/api/attachments', {}, file, onLoaded));
