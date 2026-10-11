import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GeoPoint, GeoPointSchema } from '../../common/schemas/geo-point.schema';

export type SyncLogDocument = HydratedDocument<SyncLog>;

// Prevents re-syncing the same area+category from Google before its data
// could plausibly have changed.
@Schema()
export class SyncLog {
  @Prop({ required: true })
  provider: string;

  @Prop({ required: true })
  categorySlug: string;

  @Prop({ type: GeoPointSchema, required: true })
  location: GeoPoint;

  @Prop({ required: true })
  radiusMeters: number;

  @Prop({ default: Date.now })
  syncedAt: Date;
}

export const SyncLogSchema = SchemaFactory.createForClass(SyncLog);
SyncLogSchema.index({ location: '2dsphere' });
SyncLogSchema.index({ provider: 1, categorySlug: 1, syncedAt: 1 });
