import { IsEmail, IsMongoId } from 'class-validator';

export class InviteVendorDto {
  @IsEmail()
  email: string;

  @IsMongoId()
  businessId: string;
}
