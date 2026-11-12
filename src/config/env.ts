import { resolve } from 'node:path';

import { Global, Module } from '@nestjs/common';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z
    .string()
    .min(1)
    .default('data')
    .transform((dir) => resolve(dir)),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(4096),
  // Comma-separated addresses to advertise instead of detected interfaces (needed inside containers).
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
});

export type Environment = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => envSchema.parse(process.env) }],
  exports: [ENV],
})
export class EnvModule {}
