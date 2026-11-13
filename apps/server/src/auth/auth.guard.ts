import { ForbiddenException, HttpStatus, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type Permission } from '@homelab/contracts';
import type { Request } from 'express';

import { AppError } from '../common/http/app-error.js';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, REQUIRED_PERMISSION, type AuthenticatedRequest } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import { SessionCookie } from './session-cookie.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const REQUEST_HEADER = 'x-homelab-request';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const targets = [context.getHandler(), context.getClass()];

    if (!SAFE_METHODS.has(request.method) && request.headers[REQUEST_HEADER] !== '1') {
      throw new AppError(HttpStatus.FORBIDDEN, 'CSRF_HEADER_MISSING', 'Missing X-Homelab-Request header');
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const user = await this.auth.sessionUser(this.cookie.read(request));
    if (!user) throw new UnauthorizedException('Sign in required');
    request.user = user;

    if (user.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)) {
      throw new AppError(HttpStatus.FORBIDDEN, 'PASSWORD_CHANGE_REQUIRED', 'Choose a new password first');
    }
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, targets);
    if (permission && !hasPermission(user.role, permission)) {
      throw new ForbiddenException('You do not have access to this');
    }
    return true;
  }
}
