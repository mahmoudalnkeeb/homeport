import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { INDEX_JOB_OPTIONS } from '../library.js';
import { MusicController } from './music.controller.js';
import { MUSIC_QUEUE, MusicService } from './music.service.js';
import { MusicWorker } from './music.worker.js';

@Module({
  imports: [BullModule.registerQueue({ name: MUSIC_QUEUE, defaultJobOptions: INDEX_JOB_OPTIONS })],
  controllers: [MusicController],
  providers: [MusicService, MusicWorker],
  exports: [MusicService],
})
export class MusicModule {}
