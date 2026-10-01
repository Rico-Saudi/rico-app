import { IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateDiscountDto {
  @IsMongoId()
  productId: string;

  @IsIn(['percentage', 'fixed'])
  type: string;

  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
