import { extname } from 'node:path';

import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentUser, RequirePermission } from '../../auth/auth.decorators.js';
import { EmptyResponse, RawResponse, Serialize } from '../../common/http/serialize.js';
import type { User } from '../../users/users.schema.js';
import { ToolSummaryDto } from '../tool.dto.js';
import {
  FileEntryDto,
  FolderQueryDto,
  OptionalPathQueryDto,
  RawQueryDto,
  RecentQueryDto,
  RenameDto,
  RenameResultDto,
  RequiredPathDto,
  WriteTextDto,
} from './files.dto.js';
import { FilesService } from './files.service.js';

const ACTIVE_CONTENT = new Set(['.html', '.htm', '.svg', '.xml', '.xhtml']);

@RequirePermission('files:read')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @Serialize(FileEntryDto)
  list(@CurrentUser() user: User, @Query() query: FolderQueryDto) {
    return this.files.list(user, query);
  }

  @Get('raw')
  @RawResponse()
  async raw(@CurrentUser() user: User, @Query() query: RawQueryDto, @Res() res: Response): Promise<void> {
    const { absolute, name } = await this.files.file(user, query.path);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ACTIVE_CONTENT.has(extname(name).toLowerCase())) res.setHeader('Content-Security-Policy', 'sandbox');
    const done = (error?: Error) => {
      if (error && !res.headersSent) res.status(500).end();
    };
    if (query.download) {
      res.download(absolute, name, { dotfiles: 'allow' }, done);
      return;
    }
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.sendFile(absolute, { dotfiles: 'allow' }, done);
  }

  @RequirePermission('files:write')
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 100))
  @Serialize(FileEntryDto)
  upload(
    @CurrentUser() user: User,
    @Query() query: OptionalPathQueryDto,
    @UploadedFiles() files: { originalname: string; path: string }[] | undefined
  ) {
    return this.files.upload(user, query.path, files ?? []);
  }

  @RequirePermission('files:write')
  @Put('text')
  @Serialize(FileEntryDto)
  writeText(@CurrentUser() user: User, @Body() body: WriteTextDto) {
    return this.files.writeText(user, body.path, body.content);
  }

  @RequirePermission('files:write')
  @Post('folder')
  @HttpCode(200)
  @EmptyResponse()
  createFolder(@CurrentUser() user: User, @Body() body: RequiredPathDto) {
    return this.files.createFolder(user, body.path);
  }

  @RequirePermission('files:write')
  @Post('rename')
  @HttpCode(200)
  @Serialize(RenameResultDto)
  rename(@CurrentUser() user: User, @Body() body: RenameDto) {
    return this.files.rename(user, body.path, body.name);
  }

  @RequirePermission('files:write')
  @Delete()
  @EmptyResponse()
  remove(@CurrentUser() user: User, @Query() query: RequiredPathDto) {
    return this.files.remove(user, query.path);
  }

  @Get('recent')
  @Serialize(FileEntryDto)
  recent(@CurrentUser() user: User, @Query() query: RecentQueryDto) {
    return this.files.recent(user, query);
  }

  @Get('summary')
  @Serialize(ToolSummaryDto)
  summary(@CurrentUser() user: User) {
    return this.files.summary(user);
  }
}
