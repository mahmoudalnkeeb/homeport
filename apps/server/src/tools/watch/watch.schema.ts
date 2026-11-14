import { boolean, doublePrecision, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from '../../users/users.schema.js';

export const VIDEO_KINDS = ['movie', 'episode'] as const;
export const videoKind = pgEnum('video_kind', VIDEO_KINDS);

export const shows = pgTable('shows', {
  id: uuid().primaryKey().defaultRandom(),
  folder: text().notNull().unique(),
  title: text().notNull(),
  year: integer(),
  tmdbId: integer(),
  overview: text(),
  hasPoster: boolean().notNull().default(false),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const videos = pgTable(
  'videos',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceKey: text().notNull().unique(),
    kind: videoKind().notNull(),
    title: text().notNull(),
    year: integer(),
    showId: uuid().references(() => shows.id, { onDelete: 'cascade' }),
    season: integer(),
    episode: integer(),
    tmdbId: integer(),
    overview: text(),
    hasPoster: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.kind, table.title), index().on(table.showId, table.season, table.episode)]
);

export const watchProgress = pgTable(
  'watch_progress',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    videoId: uuid()
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    position: doublePrecision().notNull(),
    duration: doublePrecision().notNull(),
    completed: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.videoId] }), index().on(table.userId, table.updatedAt)]
);

export type VideoRow = typeof videos.$inferSelect;
export type ShowRow = typeof shows.$inferSelect;
export type WatchProgressRow = typeof watchProgress.$inferSelect;
