import { IsIn, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DEAL_TYPES } from '../../deals/dto/create-deal.dto';

export class SubmitDealDto {
  @IsMongoId()
  businessId: string;

  @IsString()
  @MaxLength(120)
  titleAr: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descriptionAr?: string;

  @IsIn(DEAL_TYPES)
  dealType: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  promoCode?: string;
}
