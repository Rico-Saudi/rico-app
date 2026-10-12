import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

export class ComparedItemDto {
  @IsString()
  @Length(1, 80)
  name: string;
}

// "قارن لي وين أرخص جبنة" reaches here as the product names straight off the
// classifier, plus where the customer is. Location is required: "the cheapest
// cheese" means the cheapest one they can actually get to.
export class ComparePricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ComparedItemDto)
  items: ComparedItemDto[];

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  // Only when the customer named a kind of shop ("أرخص حليب بالبقالات").
  // Left out, every kind of shop nearby is compared — cheese is sold by a
  // supermarket, a bakery and a roastery alike.
  @IsOptional()
  @IsString()
  @Length(1, 40)
  categorySlug?: string;
}
