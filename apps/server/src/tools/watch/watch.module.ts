import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MediaModule } from '../../media/media.module.js';
import { INDEX_JOB_OPTIONS } from '../library.js';
import { TmdbClient } from './tmdb.js';
import { WatchController } from './watch.controller.js';
import { WATCH_QUEUE, WatchService } from './watch.service.js';
import { WatchWorker } from './watch.worker.js';

@Module({
  imports: [MediaModule, BullModule.registerQueue({ name: WATCH_QUEUE, defaultJobOptions: INDEX_JOB_OPTIONS })],
  controllers: [WatchController],
  providers: [WatchService, WatchWorker, TmdbClient],
  exports: [WatchService],
})
export class WatchModule {}
