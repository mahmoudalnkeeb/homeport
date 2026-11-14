import { resolve } from 'node:path';

import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

const repoPath = (fallback: string) =>
  z
    .string()
    .min(1)
    .default(fallback)
    .transform((dir) => resolve(REPO_ROOT, dir));

export const DEFAULT_S3_SECRET = 'homeport-minio';

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DISK_PATH: repoPath('.'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'Must be a postgres:// URL'),
    DB_MIGRATE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    STATE_DIR: repoPath('state'),
    ADMIN_PASSWORD: optional(z.string().min(8)),
    SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(4096),
    S3_ENDPOINT: z.url().default('http://localhost:9000'),
    S3_PUBLIC_ENDPOINT: optional(z.url()),
    S3_PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY: z.string().min(3).default('homeport'),
    S3_SECRET_KEY: z.string().min(8).default(DEFAULT_S3_SECRET),
    S3_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Must be a valid bucket name')
      .default('homeport'),
    FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
    FFPROBE_PATH: z.string().min(1).default('ffprobe'),
    TRANSCODE_CONCURRENCY: z.coerce.number().int().min(0).max(8).default(1),
    TMDB_TOKEN: optional(z.string().min(20)),
    LAN_URLS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((url) => url.trim())
          .filter(Boolean)
      )
      .pipe(z.array(z.url())),
    PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    TRUST_PROXY: optional(z.string().min(1)),
    HOST_AGENT_URL: optional(z.url()),
    AGENT_TOKEN: optional(z.string()),
    WEB_DIST: repoPath('apps/web/dist'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.S3_SECRET_KEY !== DEFAULT_S3_SECRET, {
    path: ['S3_SECRET_KEY'],
    message: 'Set S3_SECRET_KEY: the default is public and MinIO is reachable on the network',
  })
  .transform(({ PUBLIC_PORT, ...env }) => ({ ...env, PUBLIC_PORT: PUBLIC_PORT ?? env.PORT }));

export type Environment = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => envSchema.parse(process.env) }],
  exports: [ENV],
})
export class EnvModule {}
