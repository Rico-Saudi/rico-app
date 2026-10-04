import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsMongoId } from 'class-validator';

export const MAX_BULK_PRODUCT_ROWS = 1000;

// Rows are checked one by one in the service rather than here: a price list
// with one bad line should import the other 499 and say which line failed,
// not bounce the whole file.
export class BulkProductsDto {
  @IsMongoId()
  businessId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_PRODUCT_ROWS)
  // Without an element type, the global pipe's enableImplicitConversion turns
  // every row into an empty array (the reflected type of the property).
  @Type(() => Object)
  rows: unknown[];
}
