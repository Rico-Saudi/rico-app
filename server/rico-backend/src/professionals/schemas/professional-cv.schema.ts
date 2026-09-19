import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProfessionalCvDocument = HydratedDocument<ProfessionalCv>;

// The CV a tradesperson attaches to their business card — a PDF, or a photo
// of a paper one, which is how most of them actually have it.
//
// Bytes in Mongo for the same reason as ProductImage: Render's filesystem is
// ephemeral, so an uploaded file can't live on disk. Its own collection, not
// a field on Customer, so that listing or geo-searching professionals never
// drags a multi-megabyte buffer through the query.
@Schema({ timestamps: true, collection: 'professional_cvs' })
export class ProfessionalCv {
  // What the public URL is keyed by — 32 random hex characters, not the
  // document's _id. An ObjectId is a timestamp plus a counter, so serving
  // CVs by _id would let anyone walk the range and pull down documents that
  // carry people's full names, addresses and sometimes ID numbers. A card
  // shown in chat is meant to be openable by whoever it was shown to, not
  // by whoever can count.
  @Prop({ type: String, required: true, unique: true })
  token: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, required: true })
  contentType: string;

  // Shown on the card's CV button ("السيرة الذاتية.pdf") and used for the
  // download filename. Sanitized on the way in — it comes from the device.
  @Prop({ type: String, required: true, maxlength: 120 })
  fileName: string;

  @Prop({ type: Number, required: true })
  size: number;

  @Prop({ type: Buffer, required: true })
  data: Buffer;
}

export const ProfessionalCvSchema = SchemaFactory.createForClass(ProfessionalCv);
