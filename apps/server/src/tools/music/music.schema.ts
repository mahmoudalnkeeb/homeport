import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const albums = pgTable(
  'albums',
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    albumArtist: text().notNull(),
    year: integer(),
    hasCover: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.albumArtist, table.title)]
);

export const tracks = pgTable(
  'tracks',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceKey: text().notNull().unique(),
    albumId: uuid()
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    artist: text().notNull(),
    trackNo: integer(),
    discNo: integer(),
    duration: doublePrecision(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.albumId, table.discNo, table.trackNo), index().on(table.title)]
);

export type AlbumRow = typeof albums.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
