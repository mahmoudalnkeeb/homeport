import type {
  ActivityEvent,
  ActivitySnapshot,
  ApiErrorDetail,
  ApiErrorResponse,
  ApiListResponse,
  ApiResponse,
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
  UserInfo,
  UserStats,
  WriteTextBody,
} from '@homelab/contracts';

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

export const SESSION_EXPIRED = 'homelab:session-expired';

const REQUEST_HEADER = { 'X-Homelab-Request': '1' };
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
};

export function uploadFiles(folder: string, files: File[], onProgress: (ratio: number) => void): Promise<FileEntry[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/files/upload?path=${q(folder)}`);
    xhr.setRequestHeader('X-Homelab-Request', '1');
    xhr.responseType = 'json';
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      const body: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) return resolve((body as ApiListResponse<FileEntry>).data);
      if (xhr.status === 401) window.dispatchEvent(new Event(SESSION_EXPIRED));
      const error = toApiError(xhr.status, xhr.statusText, body);
      reject(error.message.startsWith(`${xhr.status} `) ? new ApiError('Upload failed', xhr.status) : error);
    });
    xhr.addEventListener('error', () => reject(new ApiError('Upload failed: network error', 0)));
    xhr.send(form);
  });
}
