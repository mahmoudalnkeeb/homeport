import type { LibraryQuery, RescanResult } from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../common/http/pagination.js';
import { Trim } from '../common/http/validation.js';

export class LibraryQueryDto extends PaginationQueryDto implements LibraryQuery {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class LibraryIdDto {
  @IsUUID()
  id!: string;
}

export class RescanResultDto implements RescanResult {
  @Expose() queued!: number;
  @Expose() removed!: number;
}
