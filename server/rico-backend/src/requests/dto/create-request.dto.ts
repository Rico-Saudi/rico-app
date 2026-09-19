import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { REQUEST_ITEM_TYPES, RequestItemType } from '../schemas/request.schema';

// Only what identifies the line and how many: the label, price and image are
// all looked up server-side from the real record, so a client can't quote
// itself a price the vendor never set.
export class CreateRequestItemDto {
  @IsIn(REQUEST_ITEM_TYPES)
  itemType: RequestItemType;

  @IsMongoId()
  itemId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}

export class CreateRequestDto {
  @IsMongoId()
  businessId: string;

  // Optional at the DTO level only: an authenticated request takes both from
  // the account (a name/phone the customer proved, not one typed per order),
  // and RequestsService rejects an anonymous request that omits them.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  // The basket. Capped because this is a lead a human reads and calls back
  // about, not a checkout — a hundred-line request is a mistake or abuse.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CreateRequestItemDto)
  items?: CreateRequestItemDto[];

  // Single-item shape, kept for app versions already in users' hands that
  // predate baskets. RequestsService folds it into a one-line items[].
  @IsOptional()
  @IsIn(REQUEST_ITEM_TYPES)
  itemType?: RequestItemType;

  @IsOptional()
  @IsMongoId()
  itemId?: string;
}
