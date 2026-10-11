import { ArrayMaxSize, IsArray, IsIn, IsMongoId, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { DEAL_TYPES } from '../../deals/dto/create-deal.dto';
import { WEATHER_BUCKETS } from '../../weather/weather.constants';

export class CreateOwnDealDto {
  @IsMongoId()
  businessId: string;

  @IsString()
  @MaxLength(120)
  titleAr: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsIn(DEAL_TYPES)
  dealType: string;

  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsString()
  promoCode?: string;

  // Weather this deal is for. Empty/absent = always shown, which is what
  // every deal did before this existed.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(WEATHER_BUCKETS, { each: true })
  weatherConditions?: string[];
}
