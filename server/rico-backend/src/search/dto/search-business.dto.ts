import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchBusinessDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50000)
  radius?: number = 3000;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @IsIn(['nearest', 'cheapest', 'open_now', 'best_rated'])
  rank?: string = 'nearest';

  /// Brand/place name the user named explicitly ("ستاربكس") — routes the
  /// Google fallback to Text Search, which can actually match a name.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brandHint?: string;

  /// Arabic label for a free-text category outside our fixed slugs (the
  /// classifier's `other` case, e.g. "محل عطور") — used as the text query.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 8;
}
