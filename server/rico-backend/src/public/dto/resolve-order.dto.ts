import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsMongoId, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

export class RequestedItemDto {
  @IsString()
  @Length(1, 80)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

// "بدي أطلب من مطعم الماهر كنافة نابلسية وأرز بحليب" reaches here as a shop
// name and a list of dish names, straight off the classifier — nothing is
// resolved to an id yet, which is exactly what this endpoint is for.
//
// The customer may also name no shop at all ("وصّلي من مطعم وجبتين شاورما").
// Then categorySlug + lat/lng stand in for the name and the service picks the
// shop itself — see PublicService.findBusinessForItems.
export class ResolveOrderDto {
  // Set when the customer tapped one of the shops Rico offered. Wins over
  // every other way of finding a shop: they chose it by hand.
  @IsOptional()
  @IsMongoId()
  businessId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  placeName?: string;

  // The kind of shop to order from when none was named. Not validated
  // against the category list on purpose: an unknown slug simply matches no
  // business and answers "ما لقيت", which beats a 400 on a hungry customer.
  @IsOptional()
  @IsString()
  @Length(1, 40)
  categorySlug?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  // May be empty: naming a shop without naming dishes is a request to see its
  // menu, which resolveOrder answers with the catalogue and an empty basket.
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RequestedItemDto)
  items: RequestedItemDto[];
}
