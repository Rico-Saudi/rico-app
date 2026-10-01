import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { BRAND_SLUGS } from '../../common/constants/brands';

// Loose on purpose: Rico runs in Saudi and Jordan, with users typing
// +966…, 05…, 07… and occasionally spaces or dashes. Anything stricter
// rejects real numbers; the number is only ever read by a human vendor
// calling back, never dialed by the system.
export const PHONE_PATTERN = /^[+\d][\d\s()-]{6,19}$/;

export class RegisterCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone_invalid' })
  phone: string;

  // Decides which name signs the OTP email (ريكو / تدلل) — see brands.ts.
  @IsOptional()
  @IsString()
  brand?: string;
}

export const KNOWN_BRAND_SLUGS = BRAND_SLUGS;
