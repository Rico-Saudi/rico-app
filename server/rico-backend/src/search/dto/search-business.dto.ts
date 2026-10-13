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

  /// What they want inside the category — a dish, a cuisine, a feature
  /// ("مندي", "جلسات خارجية"). Narrows our own results to shops whose name
  /// or menu mentions it, and goes into Google's text query.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  keyword?: string;

  /// A neighbourhood they named instead of "near me" ("النرجس"). We have no
  /// coordinates for it, so our own rows are matched by district/address
  /// over a wider radius, and Google is asked for "… في النرجس".
  @IsOptional()
  @IsString()
  @MaxLength(40)
  area?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 8;
}
