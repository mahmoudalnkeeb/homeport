import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@homeport/contracts';

import type { User } from '../users/users.schema.js';

export const IS_PUBLIC = 'auth:public';
export const REQUIRED_PERMISSION = 'auth:permission';
export const ALLOW_PENDING_PASSWORD = 'auth:allow-pending-password';

export const Public = () => SetMetadata(IS_PUBLIC, true);

export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);

export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export interface AuthenticatedRequest {
  user?: User;
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): User => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new Error('CurrentUser used on a route without AuthGuard');
  return user;
});
