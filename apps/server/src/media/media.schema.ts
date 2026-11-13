import { STREAM_STATUSES } from '@homeport/contracts';
import { boolean, doublePrecision, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const STREAM_KINDS = ['video', 'audio'] as const;
export type StreamKind = (typeof STREAM_KINDS)[number];

export const streamStatus = pgEnum('stream_status', STREAM_STATUSES);
export const streamKind = pgEnum('stream_kind', STREAM_KINDS);

export const mediaStreams = pgTable(
  'media_streams',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceKey: text().notNull().unique(),
    kind: streamKind().notNull(),
    status: streamStatus().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    error: text(),
    duration: doublePrecision(),
    hasPoster: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.status, table.createdAt)]
);

export type MediaStream = typeof mediaStreams.$inferSelect;
