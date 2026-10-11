import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type OwnerAuditLogDocument = HydratedDocument<OwnerAuditLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class OwnerAuditLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  ownerId: Types.ObjectId;

  // Denormalized so the log stays readable even if the account is later
  // deactivated/renamed.
  @Prop({ type: String, required: true })
  ownerEmail: string;

  // e.g. 'business.setActive', 'claim.review'
  @Prop({ type: String, required: true, index: true })
  action: string;

  @Prop({ type: String, required: true })
  targetType: string;

  @Prop({ type: String, required: true })
  targetId: string;

  @Prop({ type: Object, default: {} })
  detail: Record<string, unknown>;
}

export const OwnerAuditLogSchema = SchemaFactory.createForClass(OwnerAuditLog);
OwnerAuditLogSchema.index({ createdAt: -1 });
