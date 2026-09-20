import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class WeatherQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  // Picks the dialect of the suggestion text. Same fallback reasoning as
  // /compose: an unknown slug answers as the default brand rather than 400.
  @IsOptional()
  @IsString()
  @Length(1, 40)
  brand?: string;
}
