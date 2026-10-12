import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebOfferCacheDocument = HydratedDocument<WebOfferCache>;

// One answer from the web, kept for a few hours. Offers change weekly, not
// by the minute, and every miss is a paid Serper call — so the second
// customer in Riyadh asking "وش العروض" this morning gets the first one's
// answer. Mongo's TTL index drops the row; nothing has to sweep it.
@Schema({ collection: 'web_offer_cache' })
export class WebOfferCache {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ type: Object, required: true })
  payload: unknown;

  @Prop({ type: Date, default: () => new Date(), expires: 6 * 60 * 60 })
  createdAt: Date;
}

export const WebOfferCacheSchema = SchemaFactory.createForClass(WebOfferCache);
