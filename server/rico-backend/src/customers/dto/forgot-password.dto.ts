import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CustomerForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  brand?: string;
}
