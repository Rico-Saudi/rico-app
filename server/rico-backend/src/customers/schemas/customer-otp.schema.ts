import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CustomerOtpDocument = HydratedDocument<CustomerOtp>;

export const OTP_PURPOSES = ['verify_email', 'reset_password'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

// A 6-digit code emailed via Resend, stored only as a sha256 hash — the same
// treatment as PasswordResetToken, since a code that can complete a login is
// a credential even though it's short-lived. `attempts` caps brute force:
// 6 digits is only a million guesses, so the code must die long before an
// attacker can walk that space (see CustomersService.consumeOtp).
@Schema({ timestamps: true })
export class CustomerOtp {
  @Prop({ type: String, required: true, index: true })
  codeHash: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: OTP_PURPOSES })
  purpose: OtpPurpose;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  usedAt: Date | null;
}

export const CustomerOtpSchema = SchemaFactory.createForClass(CustomerOtp);
// TTL index: Mongo purges expired codes on its own, so a stale code can
// never be replayed even if the consume path somehow missed it.
CustomerOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
