import { IsIn, IsLatitude, IsLongitude } from 'class-validator';
import { CATEGORY_SLUGS } from '../../businesses/dto/create-business.dto';

export class TrackSearchGapDto {
  @IsIn(CATEGORY_SLUGS)
  categorySlug: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
