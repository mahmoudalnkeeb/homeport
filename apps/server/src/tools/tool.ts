import type { Type } from '@nestjs/common';
import type { ToolManifest } from '@homelab/contracts';

export interface ToolDefinition {
  manifest: ToolManifest;
  module: Type;
}
