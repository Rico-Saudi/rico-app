import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiUsageDocument = HydratedDocument<ApiUsage>;

// Calendar-month usage counter for paid external APIs (currently just
// Google Places), keyed generically by `provider` so any future paid
// source reuses this.
@Schema()
export class ApiUsage {
  @Prop({ required: true })
  provider: string;

  @Prop({ required: true }) // 'YYYY-MM' (UTC)
  period: string;

  @Prop({ default: 0 })
  requestCount: number;
}

export const ApiUsageSchema = SchemaFactory.createForClass(ApiUsage);
ApiUsageSchema.index({ provider: 1, period: 1 }, { unique: true });
