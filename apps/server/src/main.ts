import { config as loadDotenv } from 'dotenv';
import 'reflect-metadata';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter, type NestNodeApplication, type NodeRequest, type NodeResponse } from '@nestjs/platform-node';

import { ActivityService, apiArea } from './activity/activity.service.js';
import { AppModule } from './app.module.js';
import { ENV, envSchema, REPO_ROOT, type Environment } from './config/env.js';

async function bootstrap(): Promise<void> {
  loadDotenv({ path: join(REPO_ROOT, '.env'), quiet: true });
  const { TRUST_PROXY } = envSchema.parse(process.env);
  const adapter = new NodeAdapter(TRUST_PROXY ? { trustProxy: TRUST_PROXY } : {});
  const app = await NestFactory.create<NestNodeApplication>(AppModule, adapter);
  const env = app.get<Environment>(ENV);
  const activity = app.get(ActivityService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.useBodyParser('json', { limit: '12mb' });
  app.enableShutdownHooks();

  app.use((req: NodeRequest, _res: NodeResponse, next: () => void) => {
    activity.track(apiArea(req.path));
    next();
  });

  const index = join(env.WEB_DIST, 'index.html');
  if (existsSync(index)) {
    app.useStaticAssets(env.WEB_DIST, { index: false, maxAge: '1h' });
    app.use((req: NodeRequest, res: NodeResponse, next: () => void) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.includes('.')) return next();
      res.sendFile(index);
    });
  } else {
    logger.warn(`Web app not found at ${env.WEB_DIST}; serving the API only (use the Vite dev server)`);
  }

  await app.listen(env.PORT, env.HOST);
  logger.log(`Homeport listening on http://localhost:${env.PORT}`);
}

void bootstrap();
