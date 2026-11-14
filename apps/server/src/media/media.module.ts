import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MediaController } from './media.controller.js';
import { MEDIA_QUEUE, MediaService } from './media.service.js';
import { MediaWorker } from './media.worker.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: MEDIA_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaWorker],
  exports: [MediaService],
})
export class MediaModule {}
