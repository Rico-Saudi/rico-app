import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

class WhereDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  // Picks the country Google searches in (ريكو → Saudi, تدلل → Jordan).
  @IsOptional()
  @IsString()
  @Length(1, 30)
  brand?: string;
}

// "وش العروض؟" / "فيه عروض مطاعم؟" — topic is the classifier's label for the
// deals intent ("العروض", "عروض المطاعم").
export class WebDealsDto extends WhereDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  topic?: string;
}

class PricedItemDto {
  @IsString()
  @Length(1, 80)
  name: string;
}

// "قارن وين أرخص جبنة" — the same items the local comparison got.
export class WebPricesDto extends WhereDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PricedItemDto)
  items: PricedItemDto[];
}
