import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DiscountDocument = HydratedDocument<Discount>;

@Schema({ timestamps: true })
export class Discount {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['percentage', 'fixed'] })
  type: string;

  @Prop({ type: Number, required: true })
  value: number;

  @Prop({ type: Date, default: null })
  startDate: Date | null;

  @Prop({ type: Date, default: null })
  endDate: Date | null;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const DiscountSchema = SchemaFactory.createForClass(Discount);
