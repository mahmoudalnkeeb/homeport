import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  kindOf,
  LIBRARY_ROOTS,
  type Album,
  type AlbumDetail,
  type Artist,
  type MusicTrack,
  type RescanResult,
  type ToolSummary,
} from '@homeport/contracts';
import { and, asc, count, countDistinct, eq, ilike, inArray, notExists, or, sql, type SQL } from 'drizzle-orm';

import { Paginated, pageWindow } from '../../common/http/pagination.js';
import { InjectDb, type Database } from '../../database/database.js';
import { LIBRARY_PREFIX } from '../../storage/storage.keys.js';
import { StorageService } from '../../storage/storage.service.js';
import { escapeLike, INDEX_JOB, libraryPrefix, rawFileUrl, type IndexQueue } from '../library.js';
import type { LibraryQueryDto } from '../library.dto.js';
import type { AlbumQueryDto } from './music.dto.js';
import { albums, tracks, type AlbumRow, type TrackRow } from './music.schema.js';
import type { TrackInfo } from './tags.js';

export const MUSIC_QUEUE = 'music';

export const MUSIC = libraryPrefix(LIBRARY_ROOTS.music);

export const coverKey = (albumId: string): string => `${LIBRARY_PREFIX}covers/${albumId}.jpg`;
const coverUrl = (albumId: string | null, hasCover: boolean) => (albumId && hasCover ? `/api/music/covers/${albumId}` : null);

function toAlbum(row: AlbumRow, trackCount: number): Album {
  return {
    id: row.id,
    title: row.title,
    albumArtist: row.albumArtist,
    year: row.year,
    cover: coverUrl(row.id, row.hasCover),
    tracks: trackCount,
  };
}

function toTrack(row: TrackRow, album: AlbumRow): MusicTrack {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    albumId: album.id,
    album: album.title,
    trackNo: row.trackNo,
    discNo: row.discNo,
    duration: row.duration,
    url: rawFileUrl(row.sourceKey),
    cover: coverUrl(album.id, album.hasCover),
  };
}

@Injectable()
export class MusicService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    @InjectQueue(MUSIC_QUEUE) private readonly queue: IndexQueue
  ) {}

  owns(key: string): boolean {
    return key.startsWith(MUSIC) && kindOf(key) === 'audio';
  }

  async index(key: string): Promise<void> {
    if (this.owns(key)) await this.queue.add(INDEX_JOB, { key });
  }

  async forget(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.db.delete(tracks).where(inArray(tracks.sourceKey, keys));
    await this.removeEmptyAlbums();
  }

  async forgetPrefix(prefix: string): Promise<void> {
    await this.db.delete(tracks).where(sql`starts_with(${tracks.sourceKey}, ${prefix})`);
    await this.removeEmptyAlbums();
  }

  private async removeEmptyAlbums(): Promise<void> {
    const removed = await this.db
      .delete(albums)
      .where(notExists(this.db.select({ id: tracks.id }).from(tracks).where(eq(tracks.albumId, albums.id))))
      .returning({ id: albums.id, hasCover: albums.hasCover });
    const covers = removed.filter((row) => row.hasCover).map((row) => coverKey(row.id));
    if (covers.length) await this.storage.remove(covers);
  }

  async saveTrack(key: string, info: TrackInfo, duration: number | null): Promise<AlbumRow> {
    const album = await this.db.transaction(async (tx) => {
      const [albumRow] = await tx
        .insert(albums)
        .values({ title: info.album, albumArtist: info.albumArtist, year: info.year })
        .onConflictDoUpdate({
          target: [albums.albumArtist, albums.title],
          set: { year: sql`coalesce(${albums.year}, excluded.year)` },
        })
        .returning();
      if (!albumRow) throw new Error('Album upsert returned no row');
      const values = { albumId: albumRow.id, title: info.title, artist: info.artist, trackNo: info.trackNo, discNo: info.discNo, duration };
      await tx
        .insert(tracks)
        .values({ sourceKey: key, ...values })
        .onConflictDoUpdate({ target: tracks.sourceKey, set: values });
      return albumRow;
    });
    await this.removeEmptyAlbums();
    return album;
  }

  async saveCover(albumId: string, file: string): Promise<void> {
    await this.storage.putFile(coverKey(albumId), file, 'image/jpeg');
    await this.db.update(albums).set({ hasCover: true }).where(eq(albums.id, albumId));
  }

  async albums({ q, artist, ...page }: AlbumQueryDto): Promise<Paginated<Album>> {
    const conditions: SQL[] = [];
    if (artist) conditions.push(eq(albums.albumArtist, artist));
    if (q) {
      const like = `%${escapeLike(q)}%`;
      const match = or(ilike(albums.title, like), ilike(albums.albumArtist, like));
      if (match) conditions.push(match);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const { offset, ...window } = pageWindow(page);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ album: albums, tracks: count(tracks.id) })
        .from(albums)
        .leftJoin(tracks, eq(tracks.albumId, albums.id))
        .where(where)
        .groupBy(albums.id)
        .orderBy(asc(albums.albumArtist), asc(albums.year), asc(albums.title))
        .limit(window.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(albums).where(where),
    ]);
    return Paginated.of(
      rows.map((row) => toAlbum(row.album, row.tracks)),
      window,
      total?.value ?? 0
    );
  }

  async album(id: string): Promise<AlbumDetail> {
    const [album] = await this.db.select().from(albums).where(eq(albums.id, id));
    if (!album) throw new NotFoundException('Album not found');
    const rows = await this.db
      .select()
      .from(tracks)
      .where(eq(tracks.albumId, id))
      .orderBy(asc(tracks.discNo), asc(tracks.trackNo), asc(tracks.title));
    return { ...toAlbum(album, rows.length), trackList: rows.map((row) => toTrack(row, album)) };
  }

  async artists({ q, ...page }: LibraryQueryDto): Promise<Paginated<Artist>> {
    const where = q ? ilike(albums.albumArtist, `%${escapeLike(q)}%`) : undefined;
    const { offset, ...window } = pageWindow(page);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          name: albums.albumArtist,
          albums: count(albums.id),
          coverAlbum: sql<string | null>`(array_agg(${albums.id}) filter (where ${albums.hasCover}))[1]`,
        })
        .from(albums)
        .where(where)
        .groupBy(albums.albumArtist)
        .orderBy(asc(albums.albumArtist))
        .limit(window.pageSize)
        .offset(offset),
      this.db.select({ value: countDistinct(albums.albumArtist) }).from(albums).where(where),
    ]);
    return Paginated.of(
      rows.map((row) => ({ name: row.name, albums: row.albums, cover: coverUrl(row.coverAlbum, true) })),
      window,
      total?.value ?? 0
    );
  }

  async tracks({ q, ...page }: LibraryQueryDto): Promise<Paginated<MusicTrack>> {
    const conditions: SQL[] = [];
    if (q) {
      const like = `%${escapeLike(q)}%`;
      const match = or(ilike(tracks.title, like), ilike(tracks.artist, like), ilike(albums.title, like));
      if (match) conditions.push(match);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const { offset, ...window } = pageWindow(page);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({ track: tracks, album: albums })
        .from(tracks)
        .innerJoin(albums, eq(albums.id, tracks.albumId))
        .where(where)
        .orderBy(asc(tracks.title), asc(tracks.id))
        .limit(window.pageSize)
        .offset(offset),
      this.db.select({ value: count() }).from(tracks).innerJoin(albums, eq(albums.id, tracks.albumId)).where(where),
    ]);
    return Paginated.of(
      rows.map((row) => toTrack(row.track, row.album)),
      window,
      total?.value ?? 0
    );
  }

  async rescan(): Promise<RescanResult> {
    const present = new Set((await this.storage.list(MUSIC)).map((object) => object.key).filter((key) => this.owns(key)));
    const indexed = await this.db.select({ key: tracks.sourceKey }).from(tracks);
    const known = new Set(indexed.map((row) => row.key));
    const stale = [...known].filter((key) => !present.has(key));
    const fresh = [...present].filter((key) => !known.has(key));
    await this.forget(stale);
    if (fresh.length) await this.queue.addBulk(fresh.map((key) => ({ name: INDEX_JOB, data: { key } })));
    return { queued: fresh.length, removed: stale.length };
  }

  async summary(): Promise<ToolSummary> {
    const [albumCount, trackCount, [artists]] = await Promise.all([
      this.db.$count(albums),
      this.db.$count(tracks),
      this.db.select({ value: countDistinct(albums.albumArtist) }).from(albums),
    ]);
    return {
      tiles: [
        { label: 'Artists', value: String(artists?.value ?? 0) },
        { label: 'Albums', value: String(albumCount) },
        { label: 'Songs', value: String(trackCount) },
      ],
    };
  }
}
