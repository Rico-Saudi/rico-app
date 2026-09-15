import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GeoPoint, GeoPointSchema } from '../../common/schemas/geo-point.schema';

export type CustomerDocument = HydratedDocument<Customer>;

export const DEFAULT_SERVICE_RADIUS_METERS = 15000;
export const MIN_SERVICE_RADIUS_METERS = 1000;
export const MAX_SERVICE_RADIUS_METERS = 100000;

// A tradesperson's side of the same account. Every app user has a profile;
// filling this part in is what makes them findable when someone asks for
// "أقرب دهان" — it is not a second account type, and a person who fills it
// in keeps using the app as a customer exactly as before.
//
// It lives on Customer rather than in its own collection because it is
// profile data: one per account, edited where the name and phone are
// edited, and gone when the account goes. `serviceLocation` is where they
// work from (chosen once, not live GPS — a painter's phone position at
// 11pm says nothing about where they take jobs), and `serviceRadiusMeters`
// is how far they are willing to travel, which the search honours so
// nobody is shown a professional who would refuse the drive.
@Schema({ _id: false })
export class ProfessionalProfile {
  @Prop({ type: String, required: true }) // slug from constants/professions.ts
  profession: string;

  // Free text the professional writes about their work ("دهانات داخلية
  // وديكورات"). Shown as-is, never parsed.
  @Prop({ type: String, default: null, trim: true, maxlength: 120 })
  headline: string | null;

  @Prop({ type: GeoPointSchema, required: true })
  serviceLocation: GeoPoint;

  @Prop({ type: Number, default: DEFAULT_SERVICE_RADIUS_METERS, min: MIN_SERVICE_RADIUS_METERS, max: MAX_SERVICE_RADIUS_METERS })
  serviceRadiusMeters: number;

  // The professional's own on/off switch — "مشغول هالفترة" without deleting
  // the profile and re-entering it later. Off means invisible to search.
  @Prop({ type: Boolean, default: true })
  isAvailable: boolean;
}

export const ProfessionalProfileSchema = SchemaFactory.createForClass(ProfessionalProfile);

// The app's end user — deliberately a separate collection from Account
// (owner/vendor dashboard logins). They authenticate differently (bearer
// token from a phone, not a browser session cookie), carry different fields
// (name/phone are required here, meaningless there), and must never be able
// to reach a dashboard by having their id land in a dashboard session.
@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: String, required: true, trim: true, maxlength: 80 })
  name: string;

  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, required: true })
  passwordHash: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 20 })
  phone: string;

  // No session token is ever issued before this flips — registration only
  // yields an emailed OTP, so an address the registrant doesn't control
  // can't become a usable account.
  @Prop({ type: Boolean, default: false })
  emailVerified: boolean;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;

  // null for the overwhelming majority of users, who only ever search.
  @Prop({ type: ProfessionalProfileSchema, default: null })
  professional: ProfessionalProfile | null;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
// Sparse: only professionals carry the sub-document, so the index stays the
// size of the professional population rather than the whole user base.
CustomerSchema.index({ 'professional.serviceLocation': '2dsphere' }, { sparse: true });
CustomerSchema.index({ 'professional.profession': 1, 'professional.isAvailable': 1 }, { sparse: true });
