import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProfessionEntryDocument = HydratedDocument<ProfessionEntry>;

// One trade the platform offers. Seeded from constants/professions.ts the
// first time the server sees an empty collection, and owned by the dashboard
// from then on — adding a trade is an operations task ("people keep asking
// for a فني ألواح شمسية"), not a release.
//
// The class is named ProfessionEntry rather than Profession so it doesn't
// collide with the seed file's interface of that name; the collection is
// spelled out for the same reason.
@Schema({ timestamps: true, collection: 'professions' })
export class ProfessionEntry {
  // Stable id, never renamed: it is stored on every profile that offers the
  // trade and is what the app and the classifier send back to us.
  @Prop({ type: String, required: true, unique: true, trim: true })
  slug: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 60 })
  label: string;

  // Which picker section it appears under — a slug from
  // PROFESSION_GROUPS. Groups stay in code: they are the app's layout, not
  // data anyone needs to edit between releases.
  @Prop({ type: String, required: true, trim: true })
  group: string;

  // Common ways people write it, for the app's offline keyword fallback.
  // Never shown; an alias that already means a *place* ("عفش" is a furniture
  // shop) would make that fallback answer a question about a shop with a
  // list of people, which is why the dashboard warns about it.
  @Prop({ type: [String], default: [] })
  aliases: string[];

  // Off hides the trade from the picker and from the classifier's prompt
  // without invalidating the profiles already on it — see
  // ProfessionRegistry.has.
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  sortOrder: number;
}

export const ProfessionEntrySchema = SchemaFactory.createForClass(ProfessionEntry);
ProfessionEntrySchema.index({ group: 1, sortOrder: 1 });
