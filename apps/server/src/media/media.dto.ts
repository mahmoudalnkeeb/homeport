import type { StreamInfo, StreamStatus } from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsUUID, Matches } from 'class-validator';

export class MediaFileParamsDto {
  @IsUUID()
  id!: string;

  @Matches(/^(master|v\d{1,2})\.m3u8$|^poster\.jpg$/, { message: 'Unknown stream file' })
  file!: string;
}

export class StreamInfoDto implements StreamInfo {
  @Expose() id!: string;
  @Expose() status!: StreamStatus;
  @Expose() playlist!: string | null;
  @Expose() poster!: string | null;
  @Expose() duration!: number | null;
}
