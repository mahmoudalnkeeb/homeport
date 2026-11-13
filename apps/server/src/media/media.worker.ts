import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';

import { ENV, type Environment } from '../config/env.js';
import { contentTypeOf, STREAMS_PREFIX } from '../storage/storage.keys.js';
import { StorageService } from '../storage/storage.service.js';
import type { MediaStream } from './media.schema.js';
import { MediaService } from './media.service.js';
import { transcode } from './transcode.js';

const POLL_MS = 5_000;

@Injectable()
export class MediaWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MediaWorker.name);
  private readonly abort = new AbortController();
  private timer: NodeJS.Timeout | undefined;
  private active = 0;
  private polling = false;

  constructor(
    @Inject(ENV) private readonly env: Environment,
    private readonly media: MediaService,
    private readonly storage: StorageService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.TRANSCODE_CONCURRENCY) return;
    await this.media.recoverInterrupted();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
    void this.poll();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.abort.abort();
  }

  private async poll(): Promise<void> {
    if (this.polling || this.abort.signal.aborted) return;
    this.polling = true;
    try {
      while (this.active < this.env.TRANSCODE_CONCURRENCY && !this.abort.signal.aborted) {
        const job = await this.media.claim();
        if (!job) break;
        this.active++;
        void this.process(job).finally(() => {
          this.active--;
          void this.poll();
        });
      }
    } catch (error) {
      this.logger.warn({ event: 'media.poll_failed', reason: error instanceof Error ? error.message : 'unknown' });
    } finally {
      this.polling = false;
    }
  }

  private async process(job: MediaStream): Promise<void> {
    const started = Date.now();
    const dir = await mkdtemp(join(tmpdir(), 'homeport-transcode-'));
    try {
      const input = join(dir, 'source');
      const output = join(dir, 'hls');
      await this.storage.download(job.sourceKey, input);
      const tools = { ffmpeg: this.env.FFMPEG_PATH, ffprobe: this.env.FFPROBE_PATH, signal: this.abort.signal };
      const result = await transcode(tools, input, output, job.kind);
      for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const path = join(entry.parentPath, entry.name);
        const key = `${STREAMS_PREFIX}${job.id}/${relative(output, path).split(sep).join('/')}`;
        await this.storage.putFile(key, path, contentTypeOf(entry.name));
      }
      if (await this.media.complete(job.id, result)) {
        this.logger.log({ event: 'media.transcoded', id: job.id, kind: job.kind, ms: Date.now() - started });
      }
    } catch (error) {
      if (this.abort.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Transcoding failed';
      await this.media.fail(job.id, message);
      this.logger.warn({ event: 'media.transcode_failed', id: job.id, reason: message });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
