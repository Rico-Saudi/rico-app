import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsMongoId, IsOptional, ValidateNested } from 'class-validator';

export class ImpressionItemDto {
  @IsMongoId()
  businessId: string;

  @IsOptional()
  @IsMongoId()
  dealId?: string;
}

export class TrackImpressionsDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ImpressionItemDto)
  items: ImpressionItemDto[];
}
