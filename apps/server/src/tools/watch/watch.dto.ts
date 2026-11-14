import type { Show, ShowDetail, StreamInfo, Video, WatchProgress, WatchProgressBody } from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

import { ExposeNested } from '../../common/http/expose.js';
import { StreamInfoDto } from '../../media/media.dto.js';

const MAX_SECONDS = 24 * 3600;

export class WatchProgressBodyDto implements WatchProgressBody {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_SECONDS)
  position!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_SECONDS)
  duration!: number;
}

export class WatchProgressDto implements WatchProgress {
  @Expose() position!: number;
  @Expose() duration!: number;
  @Expose() completed!: boolean;
  @Expose() updatedAt!: string;
}

export class VideoDto implements Video {
  @Expose() id!: string;
  @Expose() kind!: 'movie' | 'episode';
  @Expose() title!: string;
  @Expose() year!: number | null;
  @Expose() overview!: string | null;
  @Expose() poster!: string | null;
  @Expose() showId!: string | null;
  @Expose() season!: number | null;
  @Expose() episode!: number | null;
  @Expose() path!: string;
  @ExposeNested(() => StreamInfoDto) stream!: StreamInfo | null;
  @ExposeNested(() => WatchProgressDto) progress!: WatchProgress | null;
}

export class ShowDto implements Show {
  @Expose() id!: string;
  @Expose() title!: string;
  @Expose() year!: number | null;
  @Expose() overview!: string | null;
  @Expose() poster!: string | null;
  @Expose() episodes!: number;
}

export class ShowDetailDto extends ShowDto implements ShowDetail {
  @ExposeNested(() => VideoDto) videos!: Video[];
}
