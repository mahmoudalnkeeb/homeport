import { z } from 'zod';

export interface ApiResponse<T> {
  data: T;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_HEADER_MISSING',
  'PASSWORD_CHANGE_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'TOO_MANY_REQUESTS',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    status: number;
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'system:read',
  'activity:read',
  'users:manage',
  'files:read',
  'files:write',
  'attachments:read',
  'attachments:write',
  'design:read',
  'library:read',
  'library:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  member: ['files:read', 'files:write', 'attachments:read', 'attachments:write', 'library:read'],
};

export const hasPermission = (role: Role, permission: Permission): boolean => ROLE_PERMISSIONS[role].includes(permission);

export const USERS_FOLDER = 'users';
export const homeOf = (username: string): string => `${USERS_FOLDER}/${username}`;

export type PathAccess = 'none' | 'read' | 'write';

export function pathAccess(user: { username: string; role: Role }, path: string): PathAccess {
  if (user.role === 'admin') return 'write';
  const [first, second] = path.split('/').filter(Boolean);
  if (first !== USERS_FOLDER) return 'read';
  return second === user.username ? 'write' : 'none';
}

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;
export const USERNAME_HINT = '2–32 characters: lowercase letters, digits, dot, dash or underscore';
export const PASSWORD_MIN = 8;

export interface LoginBody {
  username: string;
  password: string;
}
export interface ChangePasswordBody {
  current: string;
  next: string;
}
export interface CreateUserBody {
  username: string;
  displayName: string;
  role: Role;
  password: string;
}
export interface UpdateUserBody {
  displayName?: string;
  role?: Role;
  disabled?: boolean;
}
export interface ResetPasswordBody {
  password: string;
}

export interface Me {
  username: string;
  displayName: string;
  role: Role;
  permissions: Permission[];
  home: string;
  mustChangePassword: boolean;
}

export interface UserInfo {
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  storageBytes: number;
}

export interface UserStats {
  accounts: number;
  admins: number;
  disabled: number;
  activeSessions: number;
  storageBytes: number;
}

export interface QuickAction {
  label: string;
  icon: string;
  href: string;
}

export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  permission: Permission;
  summaryUrl?: string;
  quickActions: QuickAction[];
}

export interface ToolInfo extends ToolManifest {
  href: string;
}

export interface ToolSummary {
  tiles: { label: string; value: string }[];
  breakdown?: { label: string; value: number; display: string }[];
  recent?: { label: string; href: string; size: number; modified: string }[];
}

export const FILE_KINDS = [
  'folder',
  'image',
  'video',
  'audio',
  'pdf',
  'markdown',
  'text',
  'archive',
  'other',
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

const KIND_EXTENSIONS: Record<Exclude<FileKind, 'folder' | 'other'>, readonly string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico'],
  video: ['mp4', 'webm', 'mkv', 'mov', 'm4v', 'ogv', 'avi'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus'],
  pdf: ['pdf'],
  markdown: ['md', 'markdown', 'mdx'],
  text: ['txt', 'log', 'json', 'csv', 'yml', 'yaml', 'xml', 'ini', 'conf', 'env', 'ts', 'js', 'css', 'html', 'sh', 'py'],
  archive: ['zip', 'tar', 'gz', 'tgz', '7z', 'rar'],
};

const KIND_BY_EXTENSION = new Map<string, FileKind>(
  Object.entries(KIND_EXTENSIONS).flatMap(([kind, extensions]) => extensions.map((ext): [string, FileKind] => [ext, kind as FileKind]))
);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export const kindOf = (name: string): FileKind => KIND_BY_EXTENSION.get(extensionOf(name)) ?? 'other';

export const isStreamable = (kind: FileKind): kind is 'video' | 'audio' => kind === 'video' || kind === 'audio';

export const STREAM_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type StreamStatus = (typeof STREAM_STATUSES)[number];

export interface StreamInfo {
  id: string;
  status: StreamStatus;
  playlist: string | null;
  poster: string | null;
  duration: number | null;
}

export interface FileEntry {
  name: string;
  path: string;
  kind: FileKind;
  size: number;
  modified: string;
  stream?: StreamInfo | null;
}

export interface UploadStartBody {
  name: string;
  size: number;
}

export interface FileUploadStartBody extends UploadStartBody {
  folder?: string;
}

export interface UploadTicket {
  target: string;
  uploadId: string | null;
  contentType: string;
  partSize: number;
  partUrls: string[];
}

export interface UploadFinishBody {
  target: string;
  uploadId?: string;
}

export const RECENT_SCOPES = ['all', 'library', 'home'] as const;
export type RecentScope = (typeof RECENT_SCOPES)[number];

export interface FolderQuery extends PaginationQuery {
  path?: string;
}
export interface RecentQuery extends PaginationQuery {
  scope?: RecentScope;
  kind?: FileKind;
}
export interface WriteTextBody {
  path: string;
  content: string;
}
export interface RenameBody {
  path: string;
  name: string;
}
export interface RenameResult {
  path: string;
}

export const ATTACHMENT_CATEGORIES = ['image', 'video', 'audio', 'document', 'archive', 'other'] as const;
export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

const CATEGORY_BY_KIND: Record<FileKind, AttachmentCategory> = {
  folder: 'other',
  image: 'image',
  video: 'video',
  audio: 'audio',
  pdf: 'document',
  markdown: 'document',
  text: 'document',
  archive: 'archive',
  other: 'other',
};

export const categoryOf = (name: string): AttachmentCategory => CATEGORY_BY_KIND[kindOf(name)];

export interface Attachment {
  id: string;
  name: string;
  filename: string;
  category: AttachmentCategory;
  kind: FileKind;
  contentType: string;
  size: number;
  owner: string | null;
  createdAt: string;
  url: string;
  path: string | null;
  stream: StreamInfo | null;
}

export interface AttachmentQuery extends PaginationQuery {
  category?: AttachmentCategory;
  q?: string;
  mine?: boolean;
}

export interface UpdateAttachmentBody {
  name: string;
}

export interface AttachmentCategoryStats {
  category: AttachmentCategory;
  count: number;
  bytes: number;
}

export const attachmentUrl = (id: string, download = false): string => `/api/attachments/${id}/raw${download ? '?download=true' : ''}`;

const systemSample =z.object({ t: z.number(), cpu: z.number(), mem: z.number() });
export type SystemSample = z.infer<typeof systemSample>;

export const hostMetricsSchema = z.object({
  hostname: z.string(),
  platform: z.string(),
  arch: z.string(),
  uptime: z.number(),
  cpu: z.object({ model: z.string(), cores: z.number().int(), usage: z.number().nullable() }),
  memory: z.object({ total: z.number(), used: z.number() }),
  disk: z.object({ path: z.string(), total: z.number(), free: z.number(), used: z.number() }).nullable(),
  addresses: z.array(z.string()),
  history: z.array(systemSample),
});
export type HostMetrics = z.infer<typeof hostMetricsSchema>;

export type MetricsSourceKind = 'native' | 'agent' | 'container' | 'vm';

export interface MetricsSource {
  kind: MetricsSourceKind;
  label: string;
  hint?: string;
}

export interface SystemSnapshot extends Omit<HostMetrics, 'addresses'> {
  node: string;
  processUptime: number;
  urls: string[];
  source: MetricsSource;
}

export interface ActivityEvent {
  at: string;
  tool: string;
  action: string;
  detail: string;
  user: string;
}

export interface ActivitySnapshot {
  since: string;
  totalRequests: number;
  lastHour: number[];
  perArea: { area: string; count: number }[];
}

export interface PageViewBody {
  path: string;
}

export const LIBRARY_ROOTS = { movies: 'library/movies', tv: 'library/tv', music: 'library/music' } as const;

export const WATCH_COMPLETE_RATIO = 0.9;

export interface WatchProgress {
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
}

export interface WatchProgressBody {
  position: number;
  duration: number;
}

export interface Video {
  id: string;
  kind: 'movie' | 'episode';
  title: string;
  year: number | null;
  overview: string | null;
  poster: string | null;
  showId: string | null;
  season: number | null;
  episode: number | null;
  path: string;
  stream: StreamInfo | null;
  progress: WatchProgress | null;
}

export interface Show {
  id: string;
  title: string;
  year: number | null;
  overview: string | null;
  poster: string | null;
  episodes: number;
}

export interface ShowDetail extends Show {
  videos: Video[];
}

export interface Album {
  id: string;
  title: string;
  albumArtist: string;
  year: number | null;
  cover: string | null;
  tracks: number;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  albumId: string;
  album: string;
  trackNo: number | null;
  discNo: number | null;
  duration: number | null;
  url: string;
  cover: string | null;
}

export interface AlbumDetail extends Album {
  trackList: MusicTrack[];
}

export interface Artist {
  name: string;
  albums: number;
  cover: string | null;
}

export interface LibraryQuery extends PaginationQuery {
  q?: string;
}

export interface AlbumQuery extends LibraryQuery {
  artist?: string;
}

export interface RescanResult {
  queued: number;
  removed: number;
}
