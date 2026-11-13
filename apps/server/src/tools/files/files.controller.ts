import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query, Res } from '@nestjs/common';
import type { NodeResponse } from '@nestjs/platform-node';

import { CurrentUser, RequirePermission } from '../../auth/auth.decorators.js';
import { EmptyResponse, RawResponse, Serialize } from '../../common/http/serialize.js';
import { RequestHost } from '../../storage/request-host.js';
import { serveObject } from '../../storage/serve-object.js';
import { UploadFinishDto, UploadTicketDto } from '../../storage/storage.dto.js';
import { StorageService } from '../../storage/storage.service.js';
import type { User } from '../../users/users.schema.js';
import { ToolSummaryDto } from '../tool.dto.js';
import {
  FileEntryDto,
  FileUploadStartDto,
  FolderQueryDto,
  RawQueryDto,
  RecentQueryDto,
  RenameDto,
  RenameResultDto,
  RequiredPathDto,
  WriteTextDto,
} from './files.dto.js';
import { FilesService } from './files.service.js';

@RequirePermission('files:read')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly storage: StorageService
  ) {}

  @Get()
  @Serialize(FileEntryDto)
  list(@CurrentUser() user: User, @Query() query: FolderQueryDto) {
    return this.files.list(user, query);
  }

  @Get('raw')
  @RawResponse()
  async raw(@CurrentUser() user: User, @RequestHost() host: string, @Query() query: RawQueryDto, @Res() res: NodeResponse): Promise<void> {
    const { key, name } = await this.files.file(user, query.path);
    await serveObject(this.storage, res, { host, key, name, download: query.download });
  }

  @RequirePermission('files:write')
  @Post('uploads')
  @Serialize(UploadTicketDto)
  startUpload(@CurrentUser() user: User, @RequestHost() host: string, @Body() body: FileUploadStartDto) {
    return this.files.startUpload(user, host, body);
  }

  @RequirePermission('files:write')
  @Post('uploads/finish')
  @Serialize(FileEntryDto)
  finishUpload(@CurrentUser() user: User, @Body() body: UploadFinishDto) {
    return this.files.finishUpload(user, body);
  }

  @RequirePermission('files:write')
  @Post('uploads/abort')
  @HttpCode(200)
  @EmptyResponse()
  abortUpload(@CurrentUser() user: User, @Body() body: UploadFinishDto) {
    return this.files.abortUpload(user, body);
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
