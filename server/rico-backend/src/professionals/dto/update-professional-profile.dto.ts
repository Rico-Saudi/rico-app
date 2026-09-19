import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsKnownProfession } from '../validators/is-known-profession.validator';
import { MAX_SERVICE_RADIUS_METERS, MIN_SERVICE_RADIUS_METERS } from '../../customers/schemas/customer.schema';
import {
  CARD_ACCENTS,
  MAX_BIO_LENGTH,
  MAX_SKILLS,
  MAX_SKILL_LENGTH,
  MAX_YEARS_EXPERIENCE,
} from '../constants/professional-card.constants';

// Sent as `professional` inside PATCH /customer/auth/me. Explicit null there
// removes the profile entirely (the app's "ما عدت أشتغل بهالمهنة"); omitting
// the key leaves it untouched, which is what every ordinary name/phone edit
// does.
//
// The CV is deliberately absent: it is a file, so it has its own multipart
// endpoints (POST/DELETE /professionals/me/cv) and is never touched by this
// one — saving an edited card must not drop the CV attached to it.
export class UpdateProfessionalProfileDto {
  @IsKnownProfession({ message: 'profession_invalid' })
  profession: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  headline?: string;

  // "عن شغلي" — typed, or dictated in the app and transcribed before it
  // gets here. Either way it arrives as plain text.
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BIO_LENGTH, { message: 'bio_too_long' })
  bio?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SKILLS, { message: 'too_many_skills' })
  @IsString({ each: true })
  @MaxLength(MAX_SKILL_LENGTH, { each: true, message: 'skill_too_long' })
  skills?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'years_experience_invalid' })
  @Max(MAX_YEARS_EXPERIENCE, { message: 'years_experience_invalid' })
  yearsExperience?: number;

  @IsOptional()
  @IsIn(CARD_ACCENTS, { message: 'card_accent_invalid' })
  cardAccent?: string;

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
