import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;

// One token mechanism serves two purposes: an owner-created vendor account's
// first "set your password" invite, and a later "forgot my password" reset —
// same shape, different `purpose` (used only for email copy/analytics, not
// for validation logic, since both consume identically). Token stored HASHED
// (sha256), never in plaintext — see auth.util.ts. expiresAt has a TTL index
// so Mongo purges expired tokens on its own.
@Schema({ timestamps: true })
export class PasswordResetToken {
  @Prop({ type: String, required: true, unique: true })
  tokenHash: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  accountId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['invite', 'reset'] })
  purpose: 'invite' | 'reset';

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  usedAt: Date | null;
}

export const PasswordResetTokenSchema = SchemaFactory.createForClass(PasswordResetToken);
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
