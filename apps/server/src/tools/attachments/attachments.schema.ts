import { ATTACHMENT_CATEGORIES } from '@homeport/contracts';
import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from '../../users/users.schema.js';

export const attachmentCategory = pgEnum('attachment_category', ATTACHMENT_CATEGORIES);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid().primaryKey(),
    category: attachmentCategory().notNull(),
    name: text().notNull(),
    filename: text().notNull(),
    key: text().notNull().unique(),
    size: bigint({ mode: 'number' }).notNull(),
    ownerId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.category, table.createdAt), index().on(table.ownerId)]
);

export type AttachmentRow = typeof attachments.$inferSelect;
