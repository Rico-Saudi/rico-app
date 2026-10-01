import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProfessionalFileDocument = HydratedDocument<ProfessionalFile>;

/** What a stored file is for. One row per kind per professional — uploading
 * a new one of the same kind replaces it. */
export const PROFESSIONAL_FILE_KINDS = ['cv', 'photo'] as const;
export type ProfessionalFileKind = (typeof PROFESSIONAL_FILE_KINDS)[number];

// A file attached to someone's business card: the CV they published, and the
// photo of themselves on it.
//
// One collection for both because the handling is identical — validate,
// store, mint a token, drop the previous one — and the only differences are
// which types are allowed and how big they may be. Splitting it would mean
// two copies of the same upload path drifting apart.
//
// Bytes in Mongo for the same reason as ProductImage: Render's filesystem is
// ephemeral, so an uploaded file can't live on disk. Its own collection, not
// fields on Customer, so that listing or geo-searching professionals never
// drags a multi-megabyte buffer through the query.
@Schema({ timestamps: true, collection: 'professional_files' })
export class ProfessionalFile {
  // What the public URL is keyed by — 32 random hex characters, not the
  // document's _id. An ObjectId is a timestamp plus a counter, so serving
  // files by _id would let anyone walk the range and pull down CVs that
  // carry people's full names, addresses and sometimes ID numbers. A card
  // shown in chat is meant to be openable by whoever it was shown to, not
  // by whoever can count.
  @Prop({ type: String, required: true, unique: true })
  token: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: PROFESSIONAL_FILE_KINDS })
  kind: ProfessionalFileKind;

  @Prop({ type: String, required: true })
  contentType: string;

  // Shown on the card's CV button ("السيرة الذاتية.pdf") and used for the
  // download filename. Sanitized on the way in — it comes from the device.
  // Meaningless for a photo, which is rendered rather than named, but kept
  // uniform so the store path has no special cases.
  @Prop({ type: String, required: true, maxlength: 120 })
  fileName: string;

  @Prop({ type: Number, required: true })
  size: number;

  @Prop({ type: Buffer, required: true })
  data: Buffer;
}

export const ProfessionalFileSchema = SchemaFactory.createForClass(ProfessionalFile);
// One lookup shape that matters beyond the token: "this person's photo",
// when replacing or detaching it.
ProfessionalFileSchema.index({ customerId: 1, kind: 1 });
