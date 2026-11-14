import { BullRegistrar, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';

import { ENV, type Environment } from '../../config/env.js';
import type { IndexJob } from '../library.js';
import { WATCH_QUEUE, WatchService } from './watch.service.js';

@Processor(WATCH_QUEUE, { autorun: false })
export class WatchWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(WatchWorker.name);

  constructor(
    @Inject(ENV) private readonly env: Environment,
    private readonly watch: WatchService,
    private readonly registrar: BullRegistrar
  ) {
    super();
  }

  onModuleInit(): void {
    if (!this.env.TRANSCODE_CONCURRENCY) return;
    this.registrar.register();
    void this.worker.run();
  }

  async process(job: Job<IndexJob>): Promise<void> {
    try {
      await this.watch.indexNow(job.data.key);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Indexing failed';
      this.logger.warn({ event: 'watch.index_failed', key: job.data.key, attempt: job.attemptsMade + 1, reason });
      throw error;
    }
  }
}
