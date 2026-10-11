import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProfessionalRequestDocument = HydratedDocument<ProfessionalRequest>;

// A customer asking a specific tradesperson to get in touch — the same kind
// of lead as CustomerRequest, but person-to-person, so it gets its own
// collection instead of loosening CustomerRequest's required businessId and
// itemId (which the vendor dashboard reads and would then have to
// null-check on every row).
//
// Name/phone are snapshots taken at creation time, exactly as CustomerRequest
// treats them: the professional calls this number back, and a later profile
// edit must not silently rewrite the number they already tried.
@Schema({ timestamps: true })
export class ProfessionalRequest {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  professionalId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  customerName: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 20 })
  customerPhone: string;

  // What the professional was advertising when the customer picked them —
  // kept so a request still reads correctly after they change trade.
  @Prop({ type: String, required: true })
  profession: string;

  // The customer's own description of the job ("أبي أدهن غرفتين"). Optional:
  // the point of the request is the callback, not a spec.
  @Prop({ type: String, default: null, trim: true, maxlength: 300 })
  note: string | null;

  // How far apart they were when the request was made — the professional
  // sees the distance they were matched on, not a recomputed one.
  @Prop({ type: Number, default: null })
  distanceMeters: number | null;

  @Prop({ type: String, required: true, default: 'new', enum: ['new', 'handled'], index: true })
  status: 'new' | 'handled';
}

export const ProfessionalRequestSchema = SchemaFactory.createForClass(ProfessionalRequest);
ProfessionalRequestSchema.index({ professionalId: 1, createdAt: -1 });
