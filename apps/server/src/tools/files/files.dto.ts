import {
  FILE_KINDS,
  RECENT_SCOPES,
  type FileEntry,
  type FileKind,
  type FileUploadStartBody,
  type FolderQuery,
  type RecentQuery,
  type RecentScope,
  type RenameBody,
  type RenameResult,
  type WriteTextBody,
} from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ExposeNested } from '../../common/http/expose.js';
import { PaginationQueryDto } from '../../common/http/pagination.js';
import { QueryBoolean, Trim } from '../../common/http/validation.js';
import { StreamInfoDto } from '../../media/media.dto.js';
import { UploadStartDto } from '../../storage/storage.dto.js';

const PATH_MAX = 1024;
const TEXT_MAX = 10 * 1024 * 1024;

export class RequiredPathDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(PATH_MAX)
  path!: string;
}

export class FolderQueryDto extends PaginationQueryDto implements FolderQuery {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(PATH_MAX)
  path: string = '';
}

export class RawQueryDto extends RequiredPathDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  download: boolean = false;
}

export class RecentQueryDto extends PaginationQueryDto implements RecentQuery {
  @IsOptional()
  @IsIn(RECENT_SCOPES)
  scope: RecentScope = 'all';

  @IsOptional()
  @IsIn(FILE_KINDS)
  kind?: FileKind;
}

export class FileUploadStartDto extends UploadStartDto implements FileUploadStartBody {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(PATH_MAX)
  folder: string = '';
}

export class WriteTextDto implements WriteTextBody {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(PATH_MAX)
  path!: string;

  @IsString()
  @MaxLength(TEXT_MAX)
  content!: string;
}

export class RenameDto implements RenameBody {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(PATH_MAX)
  path!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}

export class FileEntryDto implements FileEntry {
  @Expose() name!: string;
  @Expose() path!: string;
  @Expose() kind!: FileKind;
  @Expose() size!: number;
  @Expose() modified!: string;
  @ExposeNested(() => StreamInfoDto) stream?: StreamInfoDto | null;
}

export class RenameResultDto implements RenameResult {
  @Expose() path!: string;
}
