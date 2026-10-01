import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { WEATHER_BUCKETS } from '../../weather/weather.constants';

export class UpdateOwnDealDto {
  @IsOptional()
  @IsString()
  titleAr?: string;

  @IsOptional()
  @IsString()
  descriptionAr?: string;

  @IsOptional()
  @IsIn(['expired'])
  status?: string;

  // Weather this deal is for. Empty/absent = always shown, which is what
  // every deal did before this existed.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(WEATHER_BUCKETS, { each: true })
  weatherConditions?: string[];
}
