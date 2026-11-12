import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';

import { ENV, type Environment } from '../../config/env.js';
import type { ToolDefinition } from '../tool.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Environment) => ({
        // Stream uploads to disk; large videos must never be buffered in memory.
        dest: join(tmpdir(), 'utility-server-uploads'),
        defParamCharset: 'utf8',
        limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
      }),
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

export const filesTool: ToolDefinition = {
  module: FilesModule,
  uiDir: join(import.meta.dirname, 'ui'),
  manifest: {
    id: 'files',
    name: 'Files',
    description: 'Browse, upload and stream files, video, audio, images and documents.',
    icon: 'folder',
    summaryUrl: '/api/files/summary',
    quickActions: [
      { label: 'Upload files', icon: 'upload', href: '/tools/files/?upload=1' },
      { label: 'Browse media', icon: 'film', href: '/tools/files/?path=video' },
    ],
  },
};
