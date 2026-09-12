import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { OTP_PURPOSES, OtpPurpose } from '../schemas/customer-otp.schema';

export class ResendOtpDto {
  @IsEmail()
  email: string;

  @IsIn(OTP_PURPOSES)
  purpose: OtpPurpose;

  @IsOptional()
  @IsString()
  brand?: string;
}
