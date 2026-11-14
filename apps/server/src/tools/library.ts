import type { Queue } from 'bullmq';

import { FILES_PREFIX } from '../storage/storage.keys.js';

export const INDEX_JOB = 'index';
export interface IndexJob {
  key: string;
}
export type IndexQueue = Pick<Queue<IndexJob>, 'add' | 'addBulk'>;

export const INDEX_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: true,
} as const;

export const libraryPrefix = (root: string): string => `${FILES_PREFIX}${root}/`;
export const filePathOf = (key: string): string => key.slice(FILES_PREFIX.length);
export const rawFileUrl = (key: string): string => `/api/files/raw?path=${encodeURIComponent(filePathOf(key))}`;
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);
