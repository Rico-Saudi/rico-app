import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type InstagramConnectionDocument = HydratedDocument<InstagramConnection>;

// One connected Instagram account, belonging to one claimed business.
//
// The access token here is a credential that can read a vendor's account, so
// it is written by the service and never leaves it: no endpoint returns it,
// and the dashboard is told only the username and whether the link is healthy.
@Schema({ timestamps: true, collection: 'instagram_connections' })
export class InstagramConnection {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business', required: true, unique: true, index: true })
  businessId: Types.ObjectId;

  // Instagram's own id for the account — stable across username changes.
  @Prop({ type: String, required: true })
  igUserId: string;

  @Prop({ type: String, required: true })
  username: string;

  @Prop({ type: String, required: true, select: false })
  accessToken: string;

  @Prop({ type: Date, required: true })
  tokenExpiresAt: Date;

  // Which vendor account authorised this, so a disconnect can be attributed
  // and a suspended account's links can be found.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Account', required: true })
  connectedByAccountId: Types.ObjectId;

  @Prop({ type: Date, default: null })
  lastImportedAt: Date | null;

  @Prop({ type: String, default: null })
  lastStatus: string | null;
}

export const InstagramConnectionSchema = SchemaFactory.createForClass(InstagramConnection);
