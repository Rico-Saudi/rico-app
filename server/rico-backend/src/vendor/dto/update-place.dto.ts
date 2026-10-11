import { IsOptional, IsString, MaxLength } from 'class-validator';

// The storefront details a shop is the best source for. Name, category and
// location stay with the owner moderation flow: changing them changes which
// searches the shop turns up in.
export class UpdatePlaceDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  openingHours?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;
}
