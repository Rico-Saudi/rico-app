import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type VendorImpressionDocument = HydratedDocument<VendorImpression>;

// One row per time a vendor's card was shown to a Rico app user in a chat
// response. Fire-and-forget from the client — no referential integrity
// enforced against Business (a later-deleted business just stops
// aggregating, which is fine for a lightweight event log like this).
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class VendorImpression {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  businessId: Types.ObjectId;

  // Set only when the card shown was a specific deal (ref Deal) — lets the
  // owner dashboard break impressions down by dealType. Null for plain
  // business-search-result impressions.
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  dealId: Types.ObjectId | null;
}

export const VendorImpressionSchema = SchemaFactory.createForClass(VendorImpression);
VendorImpressionSchema.index({ businessId: 1, createdAt: -1 });
