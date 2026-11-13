import { ROLES } from '@homeport/contracts';
import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ROLES);

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  username: text().notNull().unique(),
  displayName: text().notNull(),
  role: userRole().notNull(),
  passwordHash: text().notNull(),
  disabled: boolean().notNull().default(false),
  mustChangePassword: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp({ withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Actor = Pick<User, 'id' | 'username' | 'role'>;
