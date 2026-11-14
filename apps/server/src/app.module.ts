import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { createPostgresBackend } from 'bullmq';

import { ActivityModule } from './activity/activity.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HttpErrorFilter } from './common/http/http-error.filter.js';
import { ResponseInterceptor } from './common/http/response.interceptor.js';
import { createValidationPipe } from './common/http/validation.js';
import { ENV, EnvModule, type Environment } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { StorageModule } from './storage/storage.module.js';
import { SystemModule } from './system/system.module.js';
import { ToolsModule } from './tools/tools.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    EnvModule,
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Environment) => ({
        backendFactory: createPostgresBackend,
        connection: { connectionString: env.DATABASE_URL, migrate: env.DB_MIGRATE },
      }),
      extraOptions: { manualRegistration: true },
    }),
    DatabaseModule,
    StorageModule, HealthModule, ActivityModule, UsersModule, AuthModule, SystemModule, ToolsModule],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpErrorFilter },
  ],
})
export class AppModule {}
