import { Module } from '@nestjs/common';

import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { MediaWorker } from './media.worker.js';

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaWorker],
  exports: [MediaService],
})
export class MediaModule {}
