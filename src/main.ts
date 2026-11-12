import 'dotenv/config';
import 'reflect-metadata';

import { join } from 'node:path';

import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

import { ActivityService } from './activity/activity.service.js';
import { AppModule } from './app.module.js';
import { ENV, type Environment } from './config/env.js';
import { TOOLS } from './tools/registry.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = app.get<Environment>(ENV);
  const activity = app.get(ActivityService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useBodyParser('json', { limit: '12mb' });
  app.enableShutdownHooks();

  // Registered before static assets so page views are counted too.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    activity.track(req.path);
    next();
  });

  for (const tool of TOOLS) {
    app.useStaticAssets(tool.uiDir, { prefix: `/tools/${tool.manifest.id}/` });
    for (const asset of tool.assets ?? []) {
      app.useStaticAssets(asset.dir, { prefix: `${asset.prefix}/`, maxAge: '1d' });
    }
  }
  app.useStaticAssets(join(import.meta.dirname, '..', 'public'));

  await app.listen(env.PORT, env.HOST);
  new Logger('Bootstrap').log(`Homelab utility server listening on http://localhost:${env.PORT}`);
}

void bootstrap();
