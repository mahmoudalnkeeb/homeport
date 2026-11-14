import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { NodeResponse } from '@nestjs/platform-node';

import { CurrentUser, RequirePermission } from '../../auth/auth.decorators.js';
import { RawResponse, Serialize } from '../../common/http/serialize.js';
import { RequestHost } from '../../storage/request-host.js';
import { serveObject } from '../../storage/serve-object.js';
import { StorageService } from '../../storage/storage.service.js';
import type { User } from '../../users/users.schema.js';
import { LibraryIdDto, LibraryQueryDto, RescanResultDto } from '../library.dto.js';
import { ToolSummaryDto } from '../tool.dto.js';
import { ShowDetailDto, ShowDto, VideoDto, WatchProgressBodyDto, WatchProgressDto } from './watch.dto.js';
import { posterKey, WatchService } from './watch.service.js';

@RequirePermission('library:read')
@Controller('watch')
export class WatchController {
  constructor(
    private readonly watch: WatchService,
    private readonly storage: StorageService
  ) {}

  @Get('summary')
  @Serialize(ToolSummaryDto)
  summary() {
    return this.watch.summary();
  }

  @Get('movies')
  @Serialize(VideoDto)
  movies(@CurrentUser() user: User, @Query() query: LibraryQueryDto) {
    return this.watch.movies(user, query);
  }

  @Get('shows')
  @Serialize(ShowDto)
  shows(@Query() query: LibraryQueryDto) {
    return this.watch.shows(query);
  }

  @Get('shows/:id')
  @Serialize(ShowDetailDto)
  show(@CurrentUser() user: User, @Param() params: LibraryIdDto) {
    return this.watch.show(user, params.id);
  }

  @Get('continue')
  @Serialize(VideoDto)
  continueWatching(@CurrentUser() user: User) {
    return this.watch.continueWatching(user);
  }

  @Get('videos/:id')
  @Serialize(VideoDto)
  video(@CurrentUser() user: User, @Param() params: LibraryIdDto) {
    return this.watch.video(user, params.id);
  }

  @Put('progress/:id')
  @Serialize(WatchProgressDto)
  saveProgress(@CurrentUser() user: User, @Param() params: LibraryIdDto, @Body() body: WatchProgressBodyDto) {
    return this.watch.saveProgress(user, params.id, body);
  }

  @Get('posters/:id')
  @RawResponse()
  async poster(@RequestHost() host: string, @Param() params: LibraryIdDto, @Res() res: NodeResponse): Promise<void> {
    await serveObject(this.storage, res, { host, key: posterKey(params.id), name: 'poster.jpg', download: false });
  }

  @RequirePermission('library:manage')
  @Post('rescan')
  @HttpCode(200)
  @Serialize(RescanResultDto)
  rescan() {
    return this.watch.rescan();
  }
}
