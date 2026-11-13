import { resolve } from 'node:path';

import { Inject } from '@nestjs/common';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

export type Database = PgDatabase<PgQueryResultHKT>;

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');

export const InjectDb = (): ParameterDecorator => Inject(DB);

export const MIGRATIONS_DIR = resolve(import.meta.dirname, '..', '..', 'drizzle');

export const CASING = 'snake_case';
