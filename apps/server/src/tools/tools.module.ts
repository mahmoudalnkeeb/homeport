import { Module } from '@nestjs/common';

import { TOOLS } from './registry.js';
import { ToolsController } from './tools.controller.js';
import { ToolsService } from './tools.service.js';

@Module({
  imports: TOOLS.map((tool) => tool.module),
  controllers: [ToolsController],
  providers: [ToolsService],
})
export class ToolsModule {}
