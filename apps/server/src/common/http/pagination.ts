import type { PaginationMeta, PaginationQuery } from '@homeport/contracts';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export class PaginationQueryDto implements PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export interface PageWindow {
  page: number;
  pageSize: number;
  offset: number;
}

export const pageWindow = ({ page, pageSize }: PaginationQueryDto): PageWindow => ({
  page,
  pageSize,
  offset: (page - 1) * pageSize,
});

export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PaginationMeta
  ) {}

  static of<T>(items: T[], window: Pick<PageWindow, 'page' | 'pageSize'>, total: number): Paginated<T> {
    return new Paginated(items, {
      page: window.page,
      pageSize: window.pageSize,
      total,
      totalPages: Math.ceil(total / window.pageSize),
    });
  }

  static slice<T>(all: T[], query: PaginationQueryDto): Paginated<T> {
    const { offset, ...window } = pageWindow(query);
    return Paginated.of(all.slice(offset, offset + window.pageSize), window, all.length);
  }

  static all<T>(items: T[]): Paginated<T> {
    return new Paginated(items, { page: 1, pageSize: items.length, total: items.length, totalPages: items.length ? 1 : 0 });
  }
}
