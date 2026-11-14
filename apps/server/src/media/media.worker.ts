import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { BullRegistrar, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import { type Job, WaitingError } from 'bullmq';

import { ENV, type Environment } from '../config/env.js';
import { contentTypeOf, STREAMS_PREFIX } from '../storage/storage.keys.js';
import { StorageService } from '../storage/storage.service.js';
import { MEDIA_QUEUE, MediaService, type TranscodeJob } from './media.service.js';
import { transcode } from './transcode.js';

@Processor(MEDIA_QUEUE, { autorun: false })
export class MediaWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MediaWorker.name);
  private readonly abort = new AbortController();

  constructor(
    @Inject(ENV) private readonly env: Environment,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly registrar: BullRegistrar
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (!this.env.TRANSCODE_CONCURRENCY) return;
    const requeued = await this.media.requeueUnfinished();
    if (requeued) this.logger.log({ event: 'media.requeued', count: requeued });
    this.registrar.register();
    this.worker.concurrency = this.env.TRANSCODE_CONCURRENCY;
    void this.worker.run();
  }

  @OnWorkerEvent('closing')
  onClosing(): void {
    this.abort.abort();
  }

  async process(job: Job<TranscodeJob>, token?: string): Promise<void> {
    const stream = await this.media.start(job.data.id);
    if (!stream) return;
    const started = Date.now();
    const dir = await mkdtemp(join(tmpdir(), 'homeport-transcode-'));
    try {
      const input = join(dir, 'source');
      const output = join(dir, 'hls');
      await this.storage.download(stream.sourceKey, input);
      const tools = { ffmpeg: this.env.FFMPEG_PATH, ffprobe: this.env.FFPROBE_PATH, signal: this.abort.signal };
      const result = await transcode(tools, input, output, stream.kind);
      for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        const key = `${STREAMS_PREFIX}${stream.id}/${relative(output, path).split(sep).join('/')}`;
        await this.storage.putFile(key, path, contentTypeOf(entry.name));
      }
      if (await this.media.complete(stream.id, result)) {
        this.logger.log({ event: 'media.transcoded', id: stream.id, kind: stream.kind, ms: Date.now() - started });
      }
    } catch (error) {
      if (this.abort.signal.aborted) {
        await job.moveToWait(token);
        throw new WaitingError();
      }
      const message = error instanceof Error ? error.message : 'Transcoding failed';
      const attempt = job.attemptsMade + 1;
      const final = attempt >= (job.opts.attempts ?? 1);
      if (final) await this.media.fail(stream.id, message);
      this.logger.warn({ event: 'media.transcode_failed', id: stream.id, attempt, final, reason: message });
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
