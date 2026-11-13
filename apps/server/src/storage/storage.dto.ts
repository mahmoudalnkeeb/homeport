import type { UploadFinishBody, UploadStartBody, UploadTicket } from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

import { Trim } from '../common/http/validation.js';

export class UploadStartDto implements UploadStartBody {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsInt()
  @Min(0)
  size!: number;
}

export class UploadFinishDto implements UploadFinishBody {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  target!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  uploadId?: string;
}

export class UploadTicketDto implements UploadTicket {
  @Expose() target!: string;
  @Expose() uploadId!: string | null;
  @Expose() contentType!: string;
  @Expose() partSize!: number;
  @Expose() partUrls!: string[];
}
