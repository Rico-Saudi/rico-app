import { IsMongoId } from 'class-validator';

export class ClaimBusinessDto {
  @IsMongoId()
  businessId: string;
}
