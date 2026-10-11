import { IsIn, IsLatitude, IsLongitude, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CATEGORIES } from '../../classify/constants/classify.constants';

// Derived from the classifier's category list so a business can always be
// registered under any category the LLM is able to detect — this used to be
// a hand-maintained duplicate, which is the same pattern that let other
// category mirrors (e.g. some UI label maps) silently drift out of sync.
const CATEGORY_SLUGS = CATEGORIES;

export { CATEGORY_SLUGS };

export class CreateBusinessDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  nameAr?: string;

  @IsIn(CATEGORY_SLUGS)
  categorySlug: string;

  @IsOptional()
  @IsString()
  placeId?: string;

  // مفتاح إلغاء التكرار لمصدر خارجي (google/partner). لازم يكون حقلاً حقيقياً
  // على الـDTO: تمريره سابقاً كنوع متقاطع (`CreateBusinessDto & { sourceId?: string }`)
  // في المتحكّم جعل TypeScript يُصدر `design:paramtypes` = Object، وValidationPipe
  // يتخطّى التحقق كلياً لهذا النوع — فما اشتغل أي مُتحقِّق على هذا المسار إطلاقاً.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  sourceId?: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  openingHours?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  priceLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ratingCount?: number;
}
