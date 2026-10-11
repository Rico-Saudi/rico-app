import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type BusinessClaimDocument = HydratedDocument<BusinessClaim>;

// A vendor Account asserting ownership of a Business (location). Two ways to
// land in 'active': owner-invited (owner creates the claim directly, already
// vetted) or self-serve (starts 'pending_review', owner must approve via the
// moderation queue). Suspending an active claim cascades to expire that
// account's deals for this business (see OwnerService).
@Schema({ timestamps: true })
export class BusinessClaim {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business', required: true })
  businessId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    default: 'pending_review',
    enum: ['pending_review', 'active', 'rejected', 'suspended'],
  })
  status: string;
}

export const BusinessClaimSchema = SchemaFactory.createForClass(BusinessClaim);
BusinessClaimSchema.index({ accountId: 1, businessId: 1 }, { unique: true });
