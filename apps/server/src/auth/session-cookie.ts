import { Inject, Injectable } from '@nestjs/common';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';

import { ENV, type Environment } from '../config/env.js';

export const SESSION_COOKIE = 'homelab_session';

@Injectable()
export class SessionCookie {
  constructor(@Inject(ENV) private readonly env: Environment) {}

  read(request: NodeRequest): string | undefined {
    for (const part of (request.headers.cookie ?? '').split(';')) {
      const index = part.indexOf('=');
      if (index > 0 && part.slice(0, index).trim() === SESSION_COOKIE) {
        return decodeURIComponent(part.slice(index + 1).trim());
      }
    }
    return undefined;
  }

  set(request: NodeRequest, response: NodeResponse, token: string): void {
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.secure,
      path: '/',
      maxAge: this.env.SESSION_DAYS * 86_400_000,
    });
  }

  clear(response: NodeResponse): void {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
