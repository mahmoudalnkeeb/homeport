import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from '../users/users.schema.js';

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId), index().on(table.expiresAt)]
);

export type Session = typeof sessions.$inferSelect;
