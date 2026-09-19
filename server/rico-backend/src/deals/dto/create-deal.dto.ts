import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WEATHER_BUCKETS } from '../../weather/weather.constants';

export const DEAL_TYPES = ['percent', 'fixed', 'bogo', 'free_item', 'bundle'] as const;

export class CreateDealDto {
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
  currency?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  startsAt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  endsAt?: number;

  @IsOptional()
  @IsArray()
  activeDays?: string[];

  // Weather this deal is for. Empty/absent = always shown, which is what
  // every deal did before this existed.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(WEATHER_BUCKETS, { each: true })
  weatherConditions?: string[];

  @IsOptional()
  @IsObject()
  activeTime?: { from: string; to: string };

  @IsOptional()
  @IsString()
  sourceRef?: string;
}
