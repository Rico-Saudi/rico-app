import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_PATTERN } from './register-customer.dto';

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
}
