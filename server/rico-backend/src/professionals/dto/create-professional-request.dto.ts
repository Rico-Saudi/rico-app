import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsMongoId, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateProfessionalRequestDto {
  @IsMongoId()
  professionalId: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  // Where the customer was when they picked this professional. Optional —
  // the request stands without it — and used only to record the distance
  // the two were matched on, which the professional sees on the lead.
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  // Which regional build is asking — picks the name and dialect of the email
  // the professional receives. Not validated against the known slugs, for the
  // same reason ComposeRequestDto doesn't: an unknown one falls back to the
  // default brand rather than failing a real request.
  @IsOptional()
  @IsString()
  @Length(1, 40)
  brand?: string;
}
