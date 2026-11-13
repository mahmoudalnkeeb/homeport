import { Controller, Get } from '@nestjs/common';

import { CurrentUser } from '../auth/auth.decorators.js';
import { Serialize } from '../common/http/serialize.js';
import type { User } from '../users/users.schema.js';
import { ToolDto } from './tool.dto.js';
import { ToolsService } from './tools.service.js';

@Controller('tools')
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Get()
  @Serialize(ToolDto)
  list(@CurrentUser() user: User) {
    return this.tools.list(user);
  }
}
