import { Type } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PHONE_PATTERN } from './register-customer.dto';
import { UpdateProfessionalProfileDto } from '../../professionals/dto/update-professional-profile.dto';

// Email is deliberately not updatable here — changing it would mean
// re-running the whole verify-by-OTP flow, and nothing in the app needs it.
export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone_invalid' })
  phone?: string;

  // The trade this person offers, if any — see UpdateProfessionalProfileDto.
  // Typed as `| null` so an explicit null reaches the service as "remove it";
  // ValidateNested only runs on the object form.
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProfessionalProfileDto)
  professional?: UpdateProfessionalProfileDto | null;
}
