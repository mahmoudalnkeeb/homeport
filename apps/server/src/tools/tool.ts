import type { Type } from '@nestjs/common';
import type { ToolManifest } from '@homeport/contracts';

export interface ToolDefinition {
  manifest: ToolManifest;
  module: Type;
}
