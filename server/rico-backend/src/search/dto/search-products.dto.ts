import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchProductsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q: string;

  @IsOptional()
  @IsMongoId()
  businessId?: string;
}
