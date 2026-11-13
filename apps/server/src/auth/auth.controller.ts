import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { EmptyResponse, Serialize } from '../common/http/serialize.js';
import type { User } from '../users/users.schema.js';
import { AllowPendingPassword, CurrentUser, Public } from './auth.decorators.js';
import { ChangePasswordDto, LoginDto, MeDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { SessionCookie } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Serialize(MeDto)
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { token, user } = await this.auth.login(body.username, body.password, request.ip ?? 'unknown');
    this.cookie.set(request, response, token);
    return this.auth.toMe(user);
  }

  @AllowPendingPassword()
  @Post('logout')
  @HttpCode(200)
  @EmptyResponse()
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.auth.logout(this.cookie.read(request));
    this.cookie.clear(response);
  }

  @AllowPendingPassword()
  @Get('me')
  @Serialize(MeDto)
  me(@CurrentUser() user: User) {
    return this.auth.toMe(user);
  }

  @AllowPendingPassword()
  @Post('password')
  @HttpCode(200)
  @Serialize(MeDto)
  async changePassword(@CurrentUser() user: User, @Body() body: ChangePasswordDto, @Req() request: Request) {
    return this.auth.toMe(await this.auth.changePassword(user, body.current, body.next, this.cookie.read(request)));
  }
}
