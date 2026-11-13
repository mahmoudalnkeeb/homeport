import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { NodeResponse } from '@nestjs/platform-node';

import { CurrentUser, RequirePermission } from '../../auth/auth.decorators.js';
import { EmptyResponse, RawResponse, Serialize } from '../../common/http/serialize.js';
import { RequestHost } from '../../storage/request-host.js';
import { serveObject } from '../../storage/serve-object.js';
import { UploadFinishDto, UploadStartDto, UploadTicketDto } from '../../storage/storage.dto.js';
import { StorageService } from '../../storage/storage.service.js';
import type { User } from '../../users/users.schema.js';
import { ToolSummaryDto } from '../tool.dto.js';
import {
  AttachmentCategoryStatsDto,
  AttachmentDto,
  AttachmentIdDto,
  AttachmentQueryDto,
  AttachmentRawQueryDto,
  UpdateAttachmentDto,
} from './attachments.dto.js';
import { AttachmentsService } from './attachments.service.js';

@RequirePermission('attachments:read')
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly storage: StorageService
  ) {}

  @Get()
  @Serialize(AttachmentDto)
  list(@CurrentUser() user: User, @Query() query: AttachmentQueryDto) {
    return this.attachments.list(user, query);
  }

  @Get('categories')
  @Serialize(AttachmentCategoryStatsDto)
  categories(@CurrentUser() user: User) {
    return this.attachments.categories(user);
  }

  @Get('summary')
  @Serialize(ToolSummaryDto)
  summary(@CurrentUser() user: User) {
    return this.attachments.summary(user);
  }

  @RequirePermission('attachments:write')
  @Post('uploads')
  @Serialize(UploadTicketDto)
  startUpload(@RequestHost() host: string, @Body() body: UploadStartDto) {
    return this.attachments.startUpload(host, body);
  }

  @RequirePermission('attachments:write')
  @Post('uploads/finish')
  @Serialize(AttachmentDto)
  finishUpload(@CurrentUser() user: User, @Body() body: UploadFinishDto) {
    return this.attachments.finishUpload(user, body);
  }

  @RequirePermission('attachments:write')
  @Post('uploads/abort')
  @HttpCode(200)
  @EmptyResponse()
  abortUpload(@Body() body: UploadFinishDto) {
    return this.attachments.abortUpload(body);
  }

  @Get(':id')
  @Serialize(AttachmentDto)
  get(@CurrentUser() user: User, @Param() params: AttachmentIdDto) {
    return this.attachments.get(user, params.id);
  }

  @Get(':id/raw')
  @RawResponse()
  async raw(
    @CurrentUser() user: User,
    @RequestHost() host: string,
    @Param() params: AttachmentIdDto,
    @Query() query: AttachmentRawQueryDto,
    @Res() res: NodeResponse
  ): Promise<void> {
    const { key, name } = await this.attachments.object(user, params.id);
    await serveObject(this.storage, res, { host, key, name, download: query.download });
  }

  @RequirePermission('attachments:write')
  @Patch(':id')
  @Serialize(AttachmentDto)
  rename(@CurrentUser() user: User, @Param() params: AttachmentIdDto, @Body() body: UpdateAttachmentDto) {
    return this.attachments.rename(user, params.id, body.name);
  }

  @RequirePermission('attachments:write')
  @Delete(':id')
  @EmptyResponse()
  remove(@CurrentUser() user: User, @Param() params: AttachmentIdDto) {
    return this.attachments.remove(user, params.id);
  }
}
