import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CustomerRequestDocument = HydratedDocument<CustomerRequest>;

export const REQUEST_ITEM_TYPES = ['product', 'deal'] as const;
export type RequestItemType = (typeof REQUEST_ITEM_TYPES)[number];

// A customer's chat-originated interest in one product or deal at a
// specific business — a lightweight lead, not a payment/delivery order
// (Rico has neither). Named CustomerRequest, not Request, to avoid clashing
// with express.Request already imported throughout the controllers. itemLabel/
// itemDetail are always derived server-side from the real Product/Deal at
// creation time (see RequestsService.create), never trusted from the client —
// a snapshot, so later price/text edits don't retroactively rewrite what the
// vendor already saw.
@Schema({ timestamps: true })
export class CustomerRequest {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business', required: true, index: true })
  businessId: Types.ObjectId;

  // The logged-in app account that placed this, when there is one. Null for
  // requests from clients that predate customer accounts, which still post
  // a bare name/phone — customerName/customerPhone below stay the vendor's
  // source of truth either way, and stay a snapshot: a later profile edit
  // must not rewrite the number a vendor already tried to call.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', default: null, index: true })
  customerId: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  customerName: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 20 })
  customerPhone: string;

  @Prop({ type: String, required: true, enum: REQUEST_ITEM_TYPES })
  itemType: RequestItemType;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  itemId: Types.ObjectId;

  @Prop({ type: String, required: true })
  itemLabel: string;

  @Prop({ type: String, default: null })
  itemDetail: string | null;

  @Prop({ type: String, required: true, default: 'new', enum: ['new', 'handled'], index: true })
  status: 'new' | 'handled';
}

export const CustomerRequestSchema = SchemaFactory.createForClass(CustomerRequest);
CustomerRequestSchema.index({ businessId: 1, createdAt: -1 });
