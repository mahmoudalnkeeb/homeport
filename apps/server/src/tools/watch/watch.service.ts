import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  kindOf,
  LIBRARY_ROOTS,
  WATCH_COMPLETE_RATIO,
  type RescanResult,
  type Show,
  type ShowDetail,
  type StreamInfo,
  type ToolSummary,
  type Video,
  type WatchProgress,
  type WatchProgressBody,
} from '@homeport/contracts';
import { and, asc, count, desc, eq, ilike, inArray, notExists, sql, type SQL } from 'drizzle-orm';

import { Paginated, pageWindow } from '../../common/http/pagination.js';
import { InjectDb, type Database } from '../../database/database.js';
import { MediaService } from '../../media/media.service.js';
import { LIBRARY_PREFIX } from '../../storage/storage.keys.js';
import { StorageService } from '../../storage/storage.service.js';
import type { Actor } from '../../users/users.schema.js';
import { escapeLike, filePathOf, INDEX_JOB, libraryPrefix, type IndexQueue } from '../library.js';
import type { LibraryQueryDto } from '../library.dto.js';
import { parseEpisodePath, parseMoviePath } from './naming.js';
import { TmdbClient } from './tmdb.js';
import { shows, videos, watchProgress, type ShowRow, type VideoRow, type WatchProgressRow } from './watch.schema.js';

export const WATCH_QUEUE = 'watch';

const MOVIES = libraryPrefix(LIBRARY_ROOTS.movies);
const TV = libraryPrefix(LIBRARY_ROOTS.tv);
const CONTINUE_LIMIT = 20;

export const posterKey = (id: string): string => `${LIBRARY_PREFIX}posters/${id}.jpg`;
const posterUrl = (id: string, hasPoster: boolean) => (hasPoster ? `/api/watch/posters/${id}` : null);

function toProgress(row: WatchProgressRow): WatchProgress {
  return { position: row.position, duration: row.duration, completed: row.completed, updatedAt: row.updatedAt.toISOString() };
}

function toVideo(row: VideoRow, stream: StreamInfo | undefined, progress: WatchProgressRow | undefined): Video {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    year: row.year,
    overview: row.overview,
    poster: posterUrl(row.id, row.hasPoster),
    showId: row.showId,
    season: row.season,
    episode: row.episode,
    path: filePathOf(row.sourceKey),
    stream: stream ?? null,
    progress: progress ? toProgress(progress) : null,
  };
}

function toShow(row: ShowRow, episodes: number): Show {
  return { id: row.id, title: row.title, year: row.year, overview: row.overview, poster: posterUrl(row.id, row.hasPoster), episodes };
}

@Injectable()
export class WatchService {
  private readonly logger = new Logger(WatchService.name);

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    private readonly media: MediaService,
    private readonly tmdb: TmdbClient,
    @InjectQueue(WATCH_QUEUE) private readonly queue: IndexQueue
  ) {}

  owns(key: string): boolean {
    return (key.startsWith(MOVIES) || key.startsWith(TV)) && kindOf(key) === 'video';
  }

  async index(key: string): Promise<void> {
    if (this.owns(key)) await this.queue.add(INDEX_JOB, { key });
  }

  async forget(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const removed = await this.db
      .delete(videos)
      .where(inArray(videos.sourceKey, keys))
      .returning({ id: videos.id, hasPoster: videos.hasPoster });
    await this.cleanup(removed);
  }

  async forgetPrefix(prefix: string): Promise<void> {
    const removed = await this.db
      .delete(videos)
      .where(sql`starts_with(${videos.sourceKey}, ${prefix})`)
      .returning({ id: videos.id, hasPoster: videos.hasPoster });
    await this.cleanup(removed);
  }

  private async cleanup(removed: { id: string; hasPoster: boolean }[]): Promise<void> {
    const emptyShows = await this.db
      .delete(shows)
      .where(notExists(this.db.select({ id: videos.id }).from(videos).where(eq(videos.showId, shows.id))))
      .returning({ id: shows.id, hasPoster: shows.hasPoster });
    const posters = [...removed, ...emptyShows].filter((row) => row.hasPoster).map((row) => posterKey(row.id));
    if (posters.length) await this.storage.remove(posters);
  }

  async indexNow(key: string): Promise<void> {
    if (!this.owns(key) || !(await this.storage.head(key))) return;
    if (key.startsWith(MOVIES)) await this.indexMovie(key);
    else await this.indexEpisode(key);
  }

  private async indexMovie(key: string): Promise<void> {
    const parsed = parseMoviePath(key.slice(MOVIES.length));
    if (parsed.kind !== 'movie') return;
    const video = await this.upsertVideo({ sourceKey: key, kind: 'movie', title: parsed.title, year: parsed.year });
    if (!this.tmdb.enabled) return;
    const match = await this.tmdb.searchMovie(parsed.title, parsed.year);
    if (!match) {
      this.logger.log({ event: 'watch.unmatched', id: video.id, title: parsed.title });
      return;
    }
    const hasPoster = match.posterPath ? await this.savePoster(video.id, match.posterPath) : false;
    await this.db
      .update(videos)
      .set({ tmdbId: match.id, title: match.title, year: match.year ?? parsed.year, overview: match.overview, hasPoster })
      .where(eq(videos.id, video.id));
  }

  private async indexEpisode(key: string): Promise<void> {
    const parsed = parseEpisodePath(key.slice(TV.length));
    if (parsed?.kind !== 'episode') {
      this.logger.warn({ event: 'watch.unparsed', key });
      return;
    }
    const show = await this.matchShow(await this.upsertShow(parsed.folder, parsed.show, parsed.year));
    const fallbackTitle = parsed.title ?? `Episode ${parsed.episode}`;
    const video = await this.upsertVideo({
      sourceKey: key,
      kind: 'episode',
      title: fallbackTitle,
      year: null,
      showId: show.id,
      season: parsed.season,
      episode: parsed.episode,
    });
    if (!this.tmdb.enabled || !show.tmdbId) return;
    const details = await this.tmdb.episode(show.tmdbId, parsed.season, parsed.episode);
    if (!details) return;
    await this.db
      .update(videos)
      .set({ title: details.title ?? fallbackTitle, overview: details.overview })
      .where(eq(videos.id, video.id));
  }

  private async upsertShow(folder: string, title: string, year: number | null): Promise<ShowRow> {
    const [inserted] = await this.db.insert(shows).values({ folder, title, year }).onConflictDoNothing({ target: shows.folder }).returning();
    if (inserted) return inserted;
    const [existing] = await this.db.select().from(shows).where(eq(shows.folder, folder));
    if (!existing) throw new Error(`Show ${folder} vanished during indexing`);
    return existing;
  }

  private async matchShow(show: ShowRow): Promise<ShowRow> {
    if (!this.tmdb.enabled || show.tmdbId) return show;
    const match = await this.tmdb.searchTv(show.title, show.year);
    if (!match) {
      this.logger.log({ event: 'watch.unmatched', id: show.id, title: show.title });
      return show;
    }
    const hasPoster = match.posterPath ? await this.savePoster(show.id, match.posterPath) : false;
    const [updated] = await this.db
      .update(shows)
      .set({ tmdbId: match.id, title: match.title, year: match.year ?? show.year, overview: match.overview, hasPoster })
      .where(eq(shows.id, show.id))
      .returning();
    return updated ?? show;
  }

  private async upsertVideo(values: typeof videos.$inferInsert): Promise<VideoRow> {
    const reset = {
      kind: values.kind,
      title: values.title,
      year: values.year ?? null,
      showId: values.showId ?? null,
      season: values.season ?? null,
      episode: values.episode ?? null,
    };
    const [row] = await this.db.insert(videos).values(values).onConflictDoUpdate({ target: videos.sourceKey, set: reset }).returning();
    if (!row) throw new Error('Insert returned no row');
    return row;
  }

  private async savePoster(id: string, path: string): Promise<boolean> {
    try {
      await this.storage.put(posterKey(id), await this.tmdb.image(path), 'image/jpeg');
      return true;
    } catch (error) {
      this.logger.warn({ event: 'watch.poster_failed', id, reason: error instanceof Error ? error.message : 'unknown' });
      return false;
    }
  }

  private async toVideos(actor: Actor, rows: VideoRow[]): Promise<Video[]> {
    if (!rows.length) return [];
    const [streams, progress] = await Promise.all([
      this.media.streamsFor(rows.map((row) => row.sourceKey)),
      this.db
        .select()
        .from(watchProgress)
        .where(
          and(
            eq(watchProgress.userId, actor.id),
            inArray(
              watchProgress.videoId,
              rows.map((row) => row.id)
            )
          )
        ),
    ]);
    const byVideo = new Map(progress.map((row) => [row.videoId, row]));
    return rows.map((row) => toVideo(row, streams.get(row.sourceKey), byVideo.get(row.id)));
  }

  async movies(actor: Actor, { q, ...page }: LibraryQueryDto): Promise<Paginated<Video>> {
    const conditions: SQL[] = [eq(videos.kind, 'movie')];
    if (q) conditions.push(ilike(videos.title, `%${escapeLike(q)}%`));
    const where = and(...conditions);
    const { offset, ...window } = pageWindow(page);
    const [rows, [total]] = await Promise.all([
      this.db.select().from(videos).where(where).orderBy(asc(videos.title), asc(videos.id)).limit(window.pageSize).offset(offset),
      this.db.select({ value: count() }).from(videos).where(where),
    ]);
    return Paginated.of(await this.toVideos(actor, rows), window, total?.value ?? 0);
  }

  async shows({ q, ...page }: LibraryQueryDto): Promise<Paginated<Show>> {
    const where = q ? ilike(shows.title, `%${escapeLike(q)}%`) : undefined;
    const { offset, ...window } = pageWindow(page);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ show: shows, episodes: count(videos.id) })
        .from(shows)
        .leftJoin(videos, eq(videos.showId, shows.id))
        .where(where)
        .groupBy(shows.id)
        .orderBy(asc(shows.title), asc(shows.id))
        .limit(window.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(shows).where(where),
    ]);
    return Paginated.of(
      rows.map((row) => toShow(row.show, row.episodes)),
      window,
      total?.value ?? 0
    );
  }

  async show(actor: Actor, id: string): Promise<ShowDetail> {
    const [show] = await this.db.select().from(shows).where(eq(shows.id, id));
    if (!show) throw new NotFoundException('Show not found');
    const rows = await this.db.select().from(videos).where(eq(videos.showId, id)).orderBy(asc(videos.season), asc(videos.episode));
    return { ...toShow(show, rows.length), videos: await this.toVideos(actor, rows) };
  }

  async video(actor: Actor, id: string): Promise<Video> {
    const [row] = await this.db.select().from(videos).where(eq(videos.id, id));
    if (!row) throw new NotFoundException('Video not found');
    const [video] = await this.toVideos(actor, [row]);
    if (!video) throw new NotFoundException('Video not found');
    return video;
  }

  async continueWatching(actor: Actor): Promise<Paginated<Video>> {
    const rows = await this.db
      .select({ video: videos })
      .from(watchProgress)
      .innerJoin(videos, eq(videos.id, watchProgress.videoId))
      .where(and(eq(watchProgress.userId, actor.id), eq(watchProgress.completed, false)))
      .orderBy(desc(watchProgress.updatedAt))
      .limit(CONTINUE_LIMIT);
    return Paginated.all(
      await this.toVideos(
        actor,
        rows.map((row) => row.video)
      )
    );
  }

  async saveProgress(actor: Actor, videoId: string, { position, duration }: WatchProgressBody): Promise<WatchProgress> {
    const [video] = await this.db.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId));
    if (!video) throw new NotFoundException('Video not found');
    const values = {
      position: duration > 0 ? Math.min(position, duration) : position,
      duration,
      completed: duration > 0 && position >= duration * WATCH_COMPLETE_RATIO,
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(watchProgress)
      .values({ userId: actor.id, videoId, ...values })
      .onConflictDoUpdate({ target: [watchProgress.userId, watchProgress.videoId], set: values })
      .returning();
    if (!row) throw new Error('Upsert returned no row');
    return toProgress(row);
  }

  async rescan(): Promise<RescanResult> {
    const objects = [...(await this.storage.list(MOVIES)), ...(await this.storage.list(TV))];
    const present = new Set(objects.map((object) => object.key).filter((key) => this.owns(key)));
    const indexed = await this.db.select({ key: videos.sourceKey }).from(videos);
    const known = new Set(indexed.map((row) => row.key));
    const stale = [...known].filter((key) => !present.has(key));
    const fresh = [...present].filter((key) => !known.has(key));

    await this.forget(stale);
    if (fresh.length) await this.queue.addBulk(fresh.map((key) => ({ name: INDEX_JOB, data: { key } })));
    const streams = await this.media.streamsFor([...present]);
    for (const key of present) {
      if (!streams.has(key)) await this.media.enqueue(key, 'video');
    }
    return { queued: fresh.length, removed: stale.length };
  }

  async summary(): Promise<ToolSummary> {
    const [movies, episodes, showCount] = await Promise.all([
      this.db.$count(videos, eq(videos.kind, 'movie')),
      this.db.$count(videos, eq(videos.kind, 'episode')),
      this.db.$count(shows),
    ]);
    return {
      tiles: [
        { label: 'Movies', value: String(movies) },
        { label: 'Shows', value: String(showCount) },
        { label: 'Episodes', value: String(episodes) },
      ],
    };
  }
}
