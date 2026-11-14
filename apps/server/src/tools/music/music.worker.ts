import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BullRegistrar, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';

import { ENV, type Environment } from '../../config/env.js';
import { extractCover, probeTags } from '../../media/transcode.js';
import { StorageService } from '../../storage/storage.service.js';
import type { IndexJob } from '../library.js';
import { MUSIC, MUSIC_QUEUE, MusicService } from './music.service.js';
import { trackInfo } from './tags.js';

@Processor(MUSIC_QUEUE, { autorun: false })
export class MusicWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MusicWorker.name);

  constructor(
    @Inject(ENV) private readonly env: Environment,
    private readonly music: MusicService,
    private readonly storage: StorageService,
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
    const { key } = job.data;
    if (!this.music.owns(key) || !(await this.storage.head(key))) return;
    const dir = await mkdtemp(join(tmpdir(), 'homeport-music-'));
    try {
      const input = join(dir, 'source');
      await this.storage.download(key, input);
      const tools = { ffmpeg: this.env.FFMPEG_PATH, ffprobe: this.env.FFPROBE_PATH };
      const probed = await probeTags(tools, input);
      const album = await this.music.saveTrack(key, trackInfo(key.slice(MUSIC.length), probed.tags), probed.duration);
      if (album.hasCover || !probed.hasCover) return;
      const cover = join(dir, 'cover.jpg');
      try {
        await extractCover(tools, input, cover);
        await this.music.saveCover(album.id, cover);
      } catch (error) {
        this.logger.warn({ event: 'music.cover_failed', albumId: album.id, reason: error instanceof Error ? error.message : 'unknown' });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Indexing failed';
      this.logger.warn({ event: 'music.index_failed', key, attempt: job.attemptsMade + 1, reason });
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
