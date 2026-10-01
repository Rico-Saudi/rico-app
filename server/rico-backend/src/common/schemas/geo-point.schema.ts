import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class GeoPoint {
  @Prop({ type: String, enum: ['Point'], required: true, default: 'Point' })
  type: string;

  @Prop({ type: [Number], required: true }) // [lng, lat]
  coordinates: number[];
}

export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);
