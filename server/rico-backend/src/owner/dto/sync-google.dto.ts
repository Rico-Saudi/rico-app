import { IsBoolean, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SyncGoogleDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50000)
  radiusMeters?: number = 2000;

  @IsString()
  categorySlug: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
