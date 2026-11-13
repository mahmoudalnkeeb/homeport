import { isAbsolute, relative, resolve } from 'node:path';

import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

const repoPath = (fallback: string) =>
  z
    .string()
    .min(1)
    .default(fallback)
    .transform((dir) => resolve(REPO_ROOT, dir));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: repoPath('data'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'Must be a postgres:// URL'),
  DB_MIGRATE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  STATE_DIR: repoPath('state'),
  ADMIN_PASSWORD: z.preprocess((value) => (value === '' ? undefined : value), z.string().min(8).optional()),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(4096),
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
  HOST_AGENT_URL: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
  AGENT_TOKEN: z.preprocess((value) => (value === '' ? undefined : value), z.string().optional()),
  WEB_DIST: repoPath('apps/web/dist'),
})
  .transform(({ PUBLIC_PORT, ...env }) => ({ ...env, PUBLIC_PORT: PUBLIC_PORT ?? env.PORT }))
  .refine(
    (env) => {
      const rel = relative(env.DATA_DIR, env.STATE_DIR);
      return rel.startsWith('..') || isAbsolute(rel);
    },
    { message: 'STATE_DIR must not be inside DATA_DIR, where users could download account data', path: ['STATE_DIR'] }
  );

export type Environment = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => envSchema.parse(process.env) }],
  exports: [ENV],
})
export class EnvModule {}
