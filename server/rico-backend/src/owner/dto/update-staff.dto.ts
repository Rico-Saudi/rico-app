import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PLATFORM_ROLES, PlatformRole } from '../../accounts/schemas/account.schema';

export class UpdateStaffDto {
  @IsOptional()
  @IsIn(PLATFORM_ROLES)
  role?: PlatformRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
