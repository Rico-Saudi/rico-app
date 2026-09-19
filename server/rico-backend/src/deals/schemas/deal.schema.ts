import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DealDocument = HydratedDocument<Deal>;

@Schema({ _id: false })
class ActiveTime {
  @Prop({ type: String, default: null }) // 'HH:MM'
  from: string | null;

  @Prop({ type: String, default: null })
  to: string | null;
}
const ActiveTimeSchema = SchemaFactory.createForClass(ActiveTime);

@Schema({ timestamps: true })
export class Deal {
  // Was `placeId` ref Place — re-pointed at the merged Business collection.
  // JSON responses still expose this as `placeId` for Flutter compatibility.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business', required: true, index: true })
  businessId: Types.ObjectId;

  @Prop({ type: String, required: true })
  titleAr: string;

  @Prop({ type: String, default: null })
  descriptionAr: string | null;

  @Prop({ type: String, required: true, enum: ['percent', 'fixed', 'bogo', 'free_item', 'bundle'] })
  dealType: string;

  @Prop({ type: Number, default: null })
  value: number | null;

  @Prop({ type: String, default: 'SAR' })
  currency: string;

  @Prop({ type: String, default: null })
  promoCode: string | null;

  @Prop({ type: Date, default: null })
  startsAt: Date | null;

  @Prop({ type: Date, default: null })
  endsAt: Date | null;

  @Prop({ type: [String], default: null }) // e.g. ['fri','sat']
  activeDays: string[] | null;

  // Weather this deal is meant for, as WeatherBucket values — a vendor
  // saying "only show my iced coffee offer when it's hot". null or empty
  // means the deal is shown whatever the weather, which is the default and
  // what every existing deal has.
  //
  // Enforced as a *filter*, not a ranking hint: a vendor who limits a deal
  // to rainy days does not want it surfaced in August.
  @Prop({ type: [String], default: null })
  weatherConditions: string[] | null;

  @Prop({ type: ActiveTimeSchema, default: null })
  activeTime: ActiveTime | null;

  @Prop({
    type: String,
    required: true,
    default: 'active',
    enum: ['active', 'pending_review', 'expired', 'rejected'],
    index: true,
  })
  status: string;

  // manual | google | partner_selfserve | business_dashboard | aggregator
  @Prop({ type: String, required: true })
  source: string;

  @Prop({ type: String, default: null })
  sourceRef: string | null;

  @Prop({ type: Date, default: null })
  verifiedAt: Date | null;

  // Was `businessId` ref BusinessAccount, then BusinessAccount->Account —
  // renamed to avoid colliding with the new `businessId` (ref Business, the
  // location) above. Set only for source='business_dashboard' deals; lets a
  // claim suspension cascade to hide exactly this account's deals (see
  // BusinessClaim).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', default: null })
  ownerAccountId: Types.ObjectId | null;
}

export const DealSchema = SchemaFactory.createForClass(Deal);
