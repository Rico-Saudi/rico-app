import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type BusinessImageDocument = HydratedDocument<BusinessImage>;

// Render's filesystem is ephemeral, so an uploaded photo can't live on disk —
// it's kept as bytes here, in its own collection rather than on the Business,
// so a geo search never drags a megabyte of binary through the query.
@Schema({ timestamps: true, collection: 'business_images' })
export class BusinessImage {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Business', required: true, index: true })
  businessId: Types.ObjectId;

  @Prop({ type: String, required: true })
  contentType: string;

  @Prop({ type: Number, required: true })
  size: number;

  @Prop({ type: Buffer, required: true })
  data: Buffer;
}

export const BusinessImageSchema = SchemaFactory.createForClass(BusinessImage);
