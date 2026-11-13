import { PASSWORD_MIN, type ChangePasswordBody, type LoginBody, type Me, type Permission, type Role } from '@homeport/contracts';
import { Expose } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { TrimLower } from '../common/http/validation.js';
import { PASSWORD_MAX } from '../users/users.dto.js';

export class LoginDto implements LoginBody {
  @TrimLower()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX)
  password!: string;
}

export class ChangePasswordDto implements ChangePasswordBody {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX)
  current!: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `At least ${PASSWORD_MIN} characters` })
  @MaxLength(PASSWORD_MAX)
  next!: string;
}

export class MeDto implements Me {
  @Expose() username!: string;
  @Expose() displayName!: string;
  @Expose() role!: Role;
  @Expose() permissions!: Permission[];
  @Expose() home!: string;
  @Expose() mustChangePassword!: boolean;
}
