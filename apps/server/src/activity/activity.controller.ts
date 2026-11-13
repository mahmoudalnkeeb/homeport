import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';

import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import { PaginationQueryDto } from '../common/http/pagination.js';
import { EmptyResponse, Serialize } from '../common/http/serialize.js';
import type { User } from '../users/users.schema.js';
import { ActivityEventDto, ActivitySnapshotDto, PageViewDto } from './activity.dto.js';
import { ActivityService, pageArea } from './activity.service.js';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @RequirePermission('activity:read')
  @Get()
  @Serialize(ActivitySnapshotDto)
  snapshot() {
    return this.activity.snapshot();
  }

  @RequirePermission('activity:read')
  @Get('events')
  @Serialize(ActivityEventDto)
  events(@Query() query: PaginationQueryDto) {
    return this.activity.events(query);
  }

  @Get('mine')
  @Serialize(ActivityEventDto)
  mine(@CurrentUser() user: User, @Query() query: PaginationQueryDto) {
    return this.activity.eventsOf(user.username, query);
  }

  @Post('pageview')
  @HttpCode(200)
  @EmptyResponse()
  pageView(@Body() body: PageViewDto): void {
    this.activity.track(pageArea(body.path));
  }
}
