import { IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { REQUEST_ITEM_TYPES, RequestItemType } from '../schemas/request.schema';

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

  @IsIn(REQUEST_ITEM_TYPES)
  itemType: RequestItemType;

  @IsMongoId()
  itemId: string;
}
