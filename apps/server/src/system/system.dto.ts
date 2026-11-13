import type { MetricsSource, MetricsSourceKind, SystemSample, SystemSnapshot } from '@homelab/contracts';
import { Expose } from 'class-transformer';

import { ExposeNested } from '../common/http/expose.js';

export class CpuDto {
  @Expose() model!: string;
  @Expose() cores!: number;
  @Expose() usage!: number | null;
}

export class MemoryDto {
  @Expose() total!: number;
  @Expose() used!: number;
}

export class DiskDto {
  @Expose() path!: string;
  @Expose() total!: number;
  @Expose() free!: number;
  @Expose() used!: number;
}

export class SampleDto implements SystemSample {
  @Expose() t!: number;
  @Expose() cpu!: number;
  @Expose() mem!: number;
}

export class MetricsSourceDto implements MetricsSource {
  @Expose() kind!: MetricsSourceKind;
  @Expose() label!: string;
  @Expose() hint?: string;
}

export class SystemSnapshotDto implements SystemSnapshot {
  @Expose() hostname!: string;
  @Expose() platform!: string;
  @Expose() arch!: string;
  @Expose() uptime!: number;
  @ExposeNested(() => CpuDto) cpu!: CpuDto;
  @ExposeNested(() => MemoryDto) memory!: MemoryDto;
  @ExposeNested(() => DiskDto) disk!: DiskDto | null;
  @ExposeNested(() => SampleDto) history!: SampleDto[];
  @Expose() node!: string;
  @Expose() processUptime!: number;
  @Expose() urls!: string[];
  @ExposeNested(() => MetricsSourceDto) source!: MetricsSourceDto;
}
