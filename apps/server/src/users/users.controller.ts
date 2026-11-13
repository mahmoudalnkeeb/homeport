import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser, RequirePermission } from '../auth/auth.decorators.js';
import { EmptyResponse, Serialize } from '../common/http/serialize.js';
import {
  CreateUserDto,
  DeleteUserQueryDto,
  ListUsersQueryDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserDto,
  UsernameParamDto,
  UserStatsDto,
} from './users.dto.js';
import type { User } from './users.schema.js';
import { UsersService } from './users.service.js';

@RequirePermission('users:manage')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Serialize(UserDto)
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get('stats')
  @Serialize(UserStatsDto)
  stats() {
    return this.users.stats();
  }

  @Post()
  @Serialize(UserDto)
  create(@CurrentUser() actor: User, @Body() body: CreateUserDto) {
    return this.users.create(actor, body);
  }

  @Patch(':username')
  @Serialize(UserDto)
  update(@CurrentUser() actor: User, @Param() params: UsernameParamDto, @Body() body: UpdateUserDto) {
    return this.users.update(actor, params.username, body);
  }

  @Post(':username/password')
  @HttpCode(200)
  @EmptyResponse()
  resetPassword(@CurrentUser() actor: User, @Param() params: UsernameParamDto, @Body() body: ResetPasswordDto) {
    return this.users.resetPassword(actor, params.username, body.password);
  }

  @Delete(':username')
  @EmptyResponse()
  remove(@CurrentUser() actor: User, @Param() params: UsernameParamDto, @Query() query: DeleteUserQueryDto) {
    return this.users.remove(actor, params.username, query.deleteFiles);
  }
}
