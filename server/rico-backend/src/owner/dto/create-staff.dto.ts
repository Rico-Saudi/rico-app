import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { PLATFORM_ROLES, PlatformRole } from '../../accounts/schemas/account.schema';

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(PLATFORM_ROLES)
  role: PlatformRole;
}
