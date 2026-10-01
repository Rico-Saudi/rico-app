import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SearchGapDocument = HydratedDocument<SearchGap>;

// One row per zero-result category search in the Flutter app — surfaces
// where Rico has demand but no matching business yet (recruitment signal),
// distinct from VendorImpression which tracks demand for businesses we
// DO have.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SearchGap {
  @Prop({ type: String, required: true, index: true })
  categorySlug: string;

  @Prop({ type: Number, required: true })
  lat: number;

  @Prop({ type: Number, required: true })
  lng: number;
}

export const SearchGapSchema = SchemaFactory.createForClass(SearchGap);
