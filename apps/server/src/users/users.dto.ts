import {
  PASSWORD_MIN,
  ROLES,
  USERNAME_HINT,
  USERNAME_PATTERN,
  type CreateUserBody,
  type ResetPasswordBody,
  type Role,
  type UpdateUserBody,
  type UserInfo,
  type UserStats,
} from '@homelab/contracts';
import { Expose } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { ExposeDate } from '../common/http/expose.js';
import { PaginationQueryDto } from '../common/http/pagination.js';
import { QueryBoolean, Trim, TrimLower } from '../common/http/validation.js';

const PASSWORD_MAX = 256;
const DISPLAY_NAME_MAX = 80;

export class UsernameParamDto {
  @TrimLower()
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_HINT })
  username!: string;
}

export class CreateUserDto implements CreateUserBody {
  @TrimLower()
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_HINT })
  username!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(DISPLAY_NAME_MAX)
  displayName!: string;

  @IsIn(ROLES)
  role!: Role;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `At least ${PASSWORD_MIN} characters` })
  @MaxLength(PASSWORD_MAX)
  password!: string;
}

export class UpdateUserDto implements UpdateUserBody {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(DISPLAY_NAME_MAX)
  displayName?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

export class ResetPasswordDto implements ResetPasswordBody {
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `At least ${PASSWORD_MIN} characters` })
  @MaxLength(PASSWORD_MAX)
  password!: string;
}

export class DeleteUserQueryDto {
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  deleteFiles: boolean = false;
}

export class ListUsersQueryDto extends PaginationQueryDto {}

export class UserDto implements UserInfo {
  @Expose() username!: string;
  @Expose() displayName!: string;
  @Expose() role!: Role;
  @Expose() disabled!: boolean;
  @Expose() mustChangePassword!: boolean;
  @ExposeDate() createdAt!: string;
  @ExposeDate() lastLoginAt!: string | null;
  @Expose() storageBytes!: number;
}

export class UserStatsDto implements UserStats {
  @Expose() accounts!: number;
  @Expose() admins!: number;
  @Expose() disabled!: number;
  @Expose() activeSessions!: number;
  @Expose() storageBytes!: number;
}

export { PASSWORD_MAX };
