import type { ActivityEvent, ActivitySnapshot, PageViewBody } from '@homelab/contracts';
import { Expose, Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

import { ExposeDate, ExposeNested } from '../common/http/expose.js';

export class PageViewDto implements PageViewBody {
  @IsString()
  @MaxLength(512)
  @Matches(/^\//, { message: 'path must start with /' })
  path!: string;
}

export class ActivityEventDto implements ActivityEvent {
  @ExposeDate() at!: string;
  @Expose() tool!: string;
  @Expose() action!: string;
  @Expose() detail!: string;
  @Expose()
  @Transform(({ obj }: { obj: { username?: unknown } }) => obj.username, { toClassOnly: true })
  user!: string;
}

export class AreaCountDto {
  @Expose() area!: string;
  @Expose() count!: number;
}

export class ActivitySnapshotDto implements ActivitySnapshot {
  @Expose() since!: string;
  @Expose() totalRequests!: number;
  @Expose() lastHour!: number[];
  @ExposeNested(() => AreaCountDto) perArea!: AreaCountDto[];
}
