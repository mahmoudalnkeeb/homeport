import { Controller, Get, Param, Res } from '@nestjs/common';
import type { NodeResponse } from '@nestjs/platform-node';

import { CurrentUser } from '../auth/auth.decorators.js';
import { RawResponse } from '../common/http/serialize.js';
import { RequestHost } from '../storage/request-host.js';
import type { User } from '../users/users.schema.js';
import { MediaFileParamsDto } from './media.dto.js';
import { MediaService } from './media.service.js';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':id/:file')
  @RawResponse()
  async file(@CurrentUser() user: User, @RequestHost() host: string, @Param() params: MediaFileParamsDto, @Res() res: NodeResponse): Promise<void> {
    const file = await this.media.file(user, host, params.id, params.file);
    if (file.type === 'redirect') {
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.redirect(302, file.url);
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(file.body);
  }
}
