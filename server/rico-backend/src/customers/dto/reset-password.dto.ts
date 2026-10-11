import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class CustomerResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
