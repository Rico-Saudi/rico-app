import { IsEmail, IsIn } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsIn(['owner', 'vendor'])
  app: 'owner' | 'vendor';
}


//commit
