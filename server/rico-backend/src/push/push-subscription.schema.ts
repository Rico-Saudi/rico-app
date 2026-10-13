import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PushSubscriptionDocument = HydratedDocument<PushSubscription>;

// One browser that asked to be woken up for this vendor's new orders. Only
// the endpoint is used — pushes carry no payload, so the browser's
// encryption keys are never needed.
@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscription {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true, index: true })
  accountId: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  endpoint: string;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription);
