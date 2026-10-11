import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CustomerRequestDocument = HydratedDocument<CustomerRequest>;

export const REQUEST_ITEM_TYPES = ['product', 'deal'] as const;
export type RequestItemType = (typeof REQUEST_ITEM_TYPES)[number];

// Where the shop is with an order. Rico neither delivers nor charges, so these
// are the shop's own steps, the same for a pharmacy as for a bakery: it saw
// the order, it's ready for pickup or on its way, and it's done or called off.
export const REQUEST_STAGES = ['new', 'confirmed', 'ready', 'completed', 'cancelled'] as const;
export type RequestStage = (typeof REQUEST_STAGES)[number];

// Forward only: an order the customer already collected can't go back to
// "being prepared", and a cancelled one is reopened by ordering again.
export const NEXT_STAGES: Record<RequestStage, readonly RequestStage[]> = {
  new: ['confirmed', 'ready', 'completed', 'cancelled'],
  confirmed: ['ready', 'completed', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// One line of a request — a product or deal the customer put in their basket,
// with how many they want. Every field here is derived server-side from the
// real Product/Deal at creation time (see RequestsService.create), never
// trusted from the client: it's a snapshot, so a later price or name edit
// can't retroactively rewrite what the vendor already saw and quoted.
@Schema({ _id: false })
export class RequestItem {
  @Prop({ type: String, required: true, enum: REQUEST_ITEM_TYPES })
  itemType: RequestItemType;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  itemId: Types.ObjectId;

  @Prop({ type: String, required: true })
  label: string;

  @Prop({ type: String, default: null })
  detail: string | null;

  @Prop({ type: Number, required: true, default: 1, min: 1 })
  quantity: number;

  // Null for a deal — "buy one get one" has no single unit price to total up.
  @Prop({ type: Number, default: null })
  unitPrice: number | null;

  @Prop({ type: String, default: null })
  imageUrl: string | null;
}

export const RequestItemSchema = SchemaFactory.createForClass(RequestItem);

// A customer's chat-originated basket of products/deals at a single business —
// a lightweight lead, not a payment/delivery order (Rico has neither). Named
// CustomerRequest, not Request, to avoid clashing with express.Request already
// imported throughout the controllers.
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

  @Prop({ type: [RequestItemSchema], default: [] })
  items: RequestItem[];

  // Sum of unitPrice x quantity across the product lines, snapshotted at order
  // time for the same reason the line prices are. Deals contribute nothing —
  // they have no unit price — so a deal-only request totals 0.
  @Prop({ type: Number, required: true, default: 0 })
  total: number;

  // --- Superseded by items[] above ---
  // Requests created before baskets existed hold a single item in these four
  // fields. Nothing writes them any more; RequestsService.findForBusinesses
  // reads them into a one-line items[] so old leads still render. They stay
  // optional rather than being dropped so that history isn't rewritten.
  @Prop({ type: String, enum: REQUEST_ITEM_TYPES })
  itemType?: RequestItemType;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  itemId?: Types.ObjectId;

  @Prop({ type: String })
  itemLabel?: string;

  @Prop({ type: String, default: null })
  itemDetail?: string | null;

  // Kept as the two-value field app builds already read: 'handled' the moment
  // the shop moves the order past 'new'. `stage` carries the detail.
  @Prop({ type: String, required: true, default: 'new', enum: ['new', 'handled'], index: true })
  status: 'new' | 'handled';

  @Prop({ type: String, required: true, default: 'new', enum: REQUEST_STAGES })
  stage: RequestStage;

  @Prop({ type: Date, default: null })
  stageUpdatedAt: Date | null;

  // What the shop tells the customer — why it cancelled, or "جاهز بعد ساعة".
  @Prop({ type: String, default: null, maxlength: 300 })
  vendorNote: string | null;
}

export const CustomerRequestSchema = SchemaFactory.createForClass(CustomerRequest);
CustomerRequestSchema.index({ businessId: 1, createdAt: -1 });
