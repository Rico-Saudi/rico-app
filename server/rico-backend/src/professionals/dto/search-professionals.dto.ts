import { Type } from 'class-transformer';
import { IsIn, IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PROFESSION_SLUGS } from '../constants/professions';

export class SearchProfessionalsDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  // Only a known slug: an unknown trade has no professionals by definition,
  // and letting free text through would turn this into an open query over
  // the user collection.
  @IsIn(PROFESSION_SLUGS)
  profession: string;

  // How far the *customer* is willing to look. The professional's own
  // serviceRadiusMeters caps it from the other side — see
  // ProfessionalsService.search.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100000)
  radius?: number = 25000;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number = 8;
}
