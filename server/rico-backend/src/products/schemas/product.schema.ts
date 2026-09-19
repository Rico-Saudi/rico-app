import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business', required: true, index: true })
  businessId: Types.ObjectId;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: null }) // e.g. "food"
  category: string | null;

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({ type: Object, default: {} }) // fully dynamic — e.g. { spiceLevel, size, color, ... }
  attributes: Record<string, unknown>;

  @Prop({ type: [String], default: [] }) // normalized search terms + synonyms
  keywords: string[];

  // Denormalized — recomputed by PriceCalcService whenever price or a
  // linked Discount changes, so search/sort never needs runtime discount math.
  @Prop({ type: Number, required: true })
  finalPrice: number;

  // Denormalized the same way finalPrice is: the bytes live in the
  // product_images collection, but every read path (lean list queries, search
  // results, the app) gets a ready-to-serve URL without a second lookup.
  // Written only by ProductsService.setImage/clearImage.
  @Prop({ type: String, default: null })
  imageUrl: string | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ name: 'text', keywords: 'text' });
