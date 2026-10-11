import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { IsKnownProfession } from '../validators/is-known-profession.validator';

export class SearchProfessionalsDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  // Only a trade the platform actually offers: an unknown one has no
  // professionals by definition, and letting free text through would turn
  // this into an open query over the user collection. Checked against the
  // live registry rather than a list frozen at import time, so a trade the
  // owner added this morning is searchable this morning.
  @IsKnownProfession()
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
