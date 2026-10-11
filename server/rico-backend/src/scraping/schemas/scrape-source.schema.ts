import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ScrapeSourceDocument = HydratedDocument<ScrapeSource>;

// A page we have been told to read offers from, tied to the business it
// belongs to. Sources are added deliberately by the platform owner — there is
// no discovery crawl, so Rico never wanders onto a site nobody chose.
@Schema({ timestamps: true, collection: 'scrape_sources' })
export class ScrapeSource {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business', required: true, index: true })
  businessId: Types.ObjectId;

  @Prop({ type: String, required: true })
  url: string;

  // Gulf retail sites are single-page apps whose offers arrive by XHR, so most
  // need rendering. It costs ten times a plain fetch, hence a per-source
  // choice rather than a global default.
  @Prop({ type: Boolean, default: true })
  renderJs: boolean;

  // Switched off by the owner, or automatically after robots.txt refuses —
  // see ScrapingService. A source that has been refused stays off until a
  // human turns it back on.
  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: Date, default: null })
  lastScrapedAt: Date | null;

  // Plain-language outcome of the last run, shown in the owner dashboard:
  // 'ok: 12 offers', 'blocked by robots.txt', 'no structured data'.
  @Prop({ type: String, default: null })
  lastStatus: string | null;

  @Prop({ type: Number, default: 0 })
  lastOfferCount: number;
}

export const ScrapeSourceSchema = SchemaFactory.createForClass(ScrapeSource);
