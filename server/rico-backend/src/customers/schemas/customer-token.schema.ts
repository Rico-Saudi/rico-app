import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CustomerTokenDocument = HydratedDocument<CustomerToken>;

// The mobile app's session: an opaque random token sent as
// `Authorization: Bearer <token>`, not the express-session cookie the
// dashboards use. A phone app has no cookie jar worth relying on and needs
// a login that survives reinstall-free restarts for a year, and an opaque
// token stored server-side stays revocable (logout, or disabling an
// account) in a way a self-contained JWT wouldn't be. Only the hash is
// stored — a database dump can't be replayed as a login.
@Schema({ timestamps: true })
export class CustomerToken {
  @Prop({ type: String, required: true, unique: true })
  tokenHash: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  lastUsedAt: Date | null;
}

export const CustomerTokenSchema = SchemaFactory.createForClass(CustomerToken);
CustomerTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
