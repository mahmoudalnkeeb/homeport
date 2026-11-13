import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-node';

import { ENV, type Environment } from '../../config/env.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Environment) => ({
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
