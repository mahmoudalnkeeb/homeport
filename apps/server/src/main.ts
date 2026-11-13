import { config as loadDotenv } from 'dotenv';
import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

import { ActivityService, apiArea } from './activity/activity.service.js';
import { AppModule } from './app.module.js';
import { ENV, REPO_ROOT, type Environment } from './config/env.js';

async function bootstrap(): Promise<void> {
  loadDotenv({ path: join(REPO_ROOT, '.env'), quiet: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = app.get<Environment>(ENV);
  const activity = app.get(ActivityService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '12mb' });
  app.enableShutdownHooks();

  app.use((req: Request, _res: Response, next: NextFunction) => {
    activity.track(apiArea(req.path));
    next();
  });

  const index = join(env.WEB_DIST, 'index.html');
  if (existsSync(index)) {
    app.useStaticAssets(env.WEB_DIST, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.includes('.')) return next();
      res.sendFile(index);
    });
  } else {
    logger.warn(`Web app not found at ${env.WEB_DIST}; serving the API only (use the Vite dev server)`);
  }

  await app.listen(env.PORT, env.HOST);
  logger.log(`Homelab utility server listening on http://localhost:${env.PORT}`);
}

void bootstrap();
