import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { PROFESSION_SLUGS } from '../constants/professions';
import { MAX_SERVICE_RADIUS_METERS, MIN_SERVICE_RADIUS_METERS } from '../../customers/schemas/customer.schema';

// Sent as `professional` inside PATCH /customer/auth/me. Explicit null there
// removes the profile entirely (the app's "ما عدت أشتغل بهالمهنة"); omitting
// the key leaves it untouched, which is what every ordinary name/phone edit
// does.
export class UpdateProfessionalProfileDto {
  @IsIn(PROFESSION_SLUGS, { message: 'profession_invalid' })
  profession: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  @Type(() => Number)
  @IsLatitude({ message: 'service_location_invalid' })
  lat: number;

  @Type(() => Number)
  @IsLongitude({ message: 'service_location_invalid' })
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_SERVICE_RADIUS_METERS, { message: 'service_radius_invalid' })
  @Max(MAX_SERVICE_RADIUS_METERS, { message: 'service_radius_invalid' })
  serviceRadiusMeters?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
