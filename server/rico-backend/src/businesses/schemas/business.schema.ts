import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GeoPoint, GeoPointSchema } from '../../common/schemas/geo-point.schema';

export type BusinessDocument = HydratedDocument<Business>;

@Schema({ _id: false })
class SourceLink {
  @Prop({ type: String, required: true }) // osm | google | manual | partner
  source: string;

  @Prop({ type: String, required: true })
  sourceId: string;
}
const SourceLinkSchema = SchemaFactory.createForClass(SourceLink);

// Merged entity: absorbs the old `Place` collection (a location + its
// enrichment data) and the product-catalog plan's `Business` fields — one
// source of truth for "a business location", referenced by Products, Deals,
// and BusinessClaims.
@Schema({ timestamps: true })
export class Business {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: null })
  nameAr: string | null;

  @Prop({ type: String, required: true, index: true }) // e.g. "restaurant" | "cafe" | ...
  categorySlug: string;

  @Prop({ type: String, default: null }) // optional Google Places reference
  placeId: string | null;

  @Prop({ type: GeoPointSchema, required: true })
  location: GeoPoint;

  @Prop({ type: String, default: null })
  city: string | null;

  @Prop({ type: String, default: null })
  district: string | null;

  @Prop({ type: String, default: null })
  address: string | null;

  @Prop({ type: String, default: null })
  phone: string | null;

  @Prop({ type: String, default: null })
  openingHours: string | null;

  @Prop({ type: Number, min: 1, max: 4, default: null })
  priceLevel: number | null;

  @Prop({ type: Number, min: 0, max: 5, default: null })
  rating: number | null;

  @Prop({ type: Number, default: null })
  ratingCount: number | null;

  @Prop({ type: String, default: null })
  enrichmentSource: string | null;

  // The vendor's own storefront photo, once they upload one. Outranks
  // anything from Google: they chose it, it's current, and it's the shop as
  // they want it seen. Written only by BusinessesService.setImage/clearImage.
  @Prop({ type: String, default: null })
  imageUrl: string | null;

  // Google photo resource name for this place's first photo. Storing the
  // reference (free) rather than the image means we only ever pay for a photo
  // someone actually looks at.
  @Prop({ type: String, default: null })
  photoRef: string | null;

  // Whoever took the photo — Google's terms require crediting them wherever
  // the image is displayed, so it travels with the reference.
  @Prop({ type: String, default: null })
  photoAttribution: string | null;

  // Google Maps Platform allows caching this content for 30 days. Past that
  // the reference is treated as absent (the card falls back to its category
  // glyph) until a live search refreshes it.
  @Prop({ type: Date, default: null })
  photoRefUpdatedAt: Date | null;

  @Prop({ type: [SourceLinkSchema], default: [] })
  sourceLinks: SourceLink[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const BusinessSchema = SchemaFactory.createForClass(Business);
BusinessSchema.index({ location: '2dsphere' });
BusinessSchema.index({ 'sourceLinks.source': 1, 'sourceLinks.sourceId': 1 });
