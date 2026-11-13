import { bigint, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const activityEvents = pgTable(
  'activity_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    tool: text().notNull(),
    action: text().notNull(),
    detail: text().notNull(),
    username: text().notNull(),
  },
  (table) => [index().on(table.at.desc()), index().on(table.username, table.at.desc())]
);

export type ActivityEventRow = typeof activityEvents.$inferSelect;
