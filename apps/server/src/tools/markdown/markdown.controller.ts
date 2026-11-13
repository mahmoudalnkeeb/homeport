import { Controller, Get } from '@nestjs/common';

import { CurrentUser, RequirePermission } from '../../auth/auth.decorators.js';
import { Serialize } from '../../common/http/serialize.js';
import type { User } from '../../users/users.schema.js';
import { ToolSummaryDto } from '../tool.dto.js';
import { MarkdownService } from './markdown.service.js';

@RequirePermission('files:read')
@Controller('markdown')
export class MarkdownController {
  constructor(private readonly markdown: MarkdownService) {}

  @Get('summary')
  @Serialize(ToolSummaryDto)
  summary(@CurrentUser() user: User) {
    return this.markdown.summary(user);
  }
}
