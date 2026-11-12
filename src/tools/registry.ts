import { Controller, Get, Module } from '@nestjs/common';

import { filesTool } from './files/files.module.js';
import { markdownTool } from './markdown/markdown.module.js';
import type { ToolDefinition } from './tool.js';

/** Every tool the server mounts. Adding a tool means adding its definition here. */
export const TOOLS: ToolDefinition[] = [filesTool, markdownTool];

@Controller('tools')
export class ToolsController {
  @Get()
  list() {
    return TOOLS.map(({ manifest }) => ({ ...manifest, href: `/tools/${manifest.id}/` }));
  }
}

@Module({
  imports: TOOLS.map((tool) => tool.module),
  controllers: [ToolsController],
})
export class ToolsModule {}
