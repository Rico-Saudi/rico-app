import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProductImageDocument = HydratedDocument<ProductImage>;

// Render's filesystem is ephemeral (see TranscribeController), so an uploaded
// photo can't live on disk — it's kept as bytes here, in its own collection
// rather than on the product, so listing/searching products never drags a
// megabyte of binary through the query.
@Schema({ timestamps: true, collection: 'product_images' })
export class ProductImage {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ type: String, required: true })
  contentType: string;

  @Prop({ type: Number, required: true })
  size: number;

  @Prop({ type: Buffer, required: true })
  data: Buffer;
}

export const ProductImageSchema = SchemaFactory.createForClass(ProductImage);
