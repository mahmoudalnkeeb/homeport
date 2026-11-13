import {
  ATTACHMENT_CATEGORIES,
  type Attachment,
  type AttachmentCategory,
  type AttachmentCategoryStats,
  type AttachmentQuery,
  type FileKind,
  type UpdateAttachmentBody,
} from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

import { ExposeNested } from '../../common/http/expose.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { QueryBoolean, Trim } from '../../common/http/validation.js';
import { StreamInfoDto } from '../../media/media.dto.js';

export class AttachmentQueryDto extends PaginationQueryDto implements AttachmentQuery {
  @IsOptional()
  @IsIn(ATTACHMENT_CATEGORIES)
  category?: AttachmentCategory;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  mine: boolean = false;
}

export class AttachmentIdDto {
  @IsUUID()
  id!: string;
}

export class AttachmentRawQueryDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  download: boolean = false;
}

export class UpdateAttachmentDto implements UpdateAttachmentBody {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class AttachmentDto implements Attachment {
  @Expose() id!: string;
  @Expose() name!: string;
  @Expose() filename!: string;
  @Expose() category!: AttachmentCategory;
  @Expose() kind!: FileKind;
  @Expose() contentType!: string;
  @Expose() size!: number;
  @Expose() owner!: string | null;
  @Expose() createdAt!: string;
  @Expose() url!: string;
  @Expose() path!: string | null;
  @ExposeNested(() => StreamInfoDto) stream!: StreamInfoDto | null;
}

export class AttachmentCategoryStatsDto implements AttachmentCategoryStats {
  @Expose() category!: AttachmentCategory;
  @Expose() count!: number;
  @Expose() bytes!: number;
}
