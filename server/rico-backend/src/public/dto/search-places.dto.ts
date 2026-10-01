import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchPlacesDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q: string;
}
