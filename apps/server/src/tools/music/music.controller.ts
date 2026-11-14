import { Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { NodeResponse } from '@nestjs/platform-node';

import { RequirePermission } from '../../auth/auth.decorators.js';
import { RawResponse, Serialize } from '../../common/http/serialize.js';
import { RequestHost } from '../../storage/request-host.js';
import { serveObject } from '../../storage/serve-object.js';
import { StorageService } from '../../storage/storage.service.js';
import { LibraryIdDto, LibraryQueryDto, RescanResultDto } from '../library.dto.js';
import { ToolSummaryDto } from '../tool.dto.js';
import { AlbumDetailDto, AlbumDto, AlbumQueryDto, ArtistDto, MusicTrackDto } from './music.dto.js';
import { coverKey, MusicService } from './music.service.js';

@RequirePermission('library:read')
@Controller('music')
export class MusicController {
  constructor(
    private readonly music: MusicService,
    private readonly storage: StorageService
  ) {}

  @Get('summary')
  @Serialize(ToolSummaryDto)
  summary() {
    return this.music.summary();
  }

  @Get('albums')
  @Serialize(AlbumDto)
  albums(@Query() query: AlbumQueryDto) {
    return this.music.albums(query);
  }

  @Get('albums/:id')
  @Serialize(AlbumDetailDto)
  album(@Param() params: LibraryIdDto) {
    return this.music.album(params.id);
  }

  @Get('artists')
  @Serialize(ArtistDto)
  artists(@Query() query: LibraryQueryDto) {
    return this.music.artists(query);
  }

  @Get('tracks')
  @Serialize(MusicTrackDto)
  tracks(@Query() query: LibraryQueryDto) {
    return this.music.tracks(query);
  }

  @Get('covers/:id')
  @RawResponse()
  async cover(@RequestHost() host: string, @Param() params: LibraryIdDto, @Res() res: NodeResponse): Promise<void> {
    await serveObject(this.storage, res, { host, key: coverKey(params.id), name: 'cover.jpg', download: false });
  }

  @RequirePermission('library:manage')
  @Post('rescan')
  @HttpCode(200)
  @Serialize(RescanResultDto)
  rescan() {
    return this.music.rescan();
  }
}
