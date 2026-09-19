import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Length, Max, Min, ValidateNested } from 'class-validator';

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
export class ResolveOrderDto {
  @IsString()
  @Length(1, 120)
  placeName: string;

  // May be empty: naming a shop without naming dishes is a request to see its
  // menu, which resolveOrder answers with the catalogue and an empty basket.
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RequestedItemDto)
  items: RequestedItemDto[];
}
