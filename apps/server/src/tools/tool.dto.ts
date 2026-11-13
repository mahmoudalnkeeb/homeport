import type { Permission, QuickAction, ToolInfo, ToolSummary } from '@homeport/contracts';
import { Expose } from 'class-transformer';

import { ExposeNested } from '../common/http/expose.js';

export class QuickActionDto implements QuickAction {
  @Expose() label!: string;
  @Expose() icon!: string;
  @Expose() href!: string;
}

export class ToolDto implements ToolInfo {
  @Expose() id!: string;
  @Expose() name!: string;
  @Expose() description!: string;
  @Expose() icon!: string;
  @Expose() permission!: Permission;
  @Expose() summaryUrl?: string;
  @Expose() href!: string;
  @ExposeNested(() => QuickActionDto) quickActions!: QuickActionDto[];
}

export class SummaryTileDto {
  @Expose() label!: string;
  @Expose() value!: string;
}

export class SummaryBreakdownDto {
  @Expose() label!: string;
  @Expose() value!: number;
  @Expose() display!: string;
}

export class SummaryRecentDto {
  @Expose() label!: string;
  @Expose() href!: string;
  @Expose() size!: number;
  @Expose() modified!: string;
}

export class ToolSummaryDto implements ToolSummary {
  @ExposeNested(() => SummaryTileDto) tiles!: SummaryTileDto[];
  @ExposeNested(() => SummaryBreakdownDto) breakdown?: SummaryBreakdownDto[];
  @ExposeNested(() => SummaryRecentDto) recent?: SummaryRecentDto[];
}
