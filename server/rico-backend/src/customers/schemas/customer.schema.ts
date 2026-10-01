import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { GeoPoint, GeoPointSchema } from '../../common/schemas/geo-point.schema';
import {
  CARD_ACCENTS,
  DEFAULT_CARD_ACCENT,
  MAX_BIO_LENGTH,
  MAX_YEARS_EXPERIENCE,
} from '../../professionals/constants/professional-card.constants';


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

  // The professional's own photo, denormalized from the professional_files
  // document so that rendering a card never needs a second query. Null until
  // one is uploaded, and the card draws a monogram instead — a card with no
  // face is a card, a card with a broken image is not.
  @Prop({ type: String, default: null })
  photoUrl: string | null;

  // Free text the professional writes about their work ("دهانات داخلية
  // وديكورات"). Shown as-is, never parsed. The one-line version — it is the
  // card's subtitle, under the trade.
  @Prop({ type: String, default: null, trim: true, maxlength: 120 })
  headline: string | null;

  // The longer "عن شغلي" the card carries: what they do, how they work, what
  // they've done before. Often dictated rather than typed — the app records
  // it and puts the transcript in this field — so it is stored exactly as it
  // arrives, with no attempt to interpret it.
  @Prop({ type: String, default: null, trim: true, maxlength: MAX_BIO_LENGTH })
  bio: string | null;

  // Short tags under the bio ("دهانات داخلية"، "ورق جدران"). A handful of
  // chips reads at a glance in a chat thread where a paragraph doesn't.
  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({ type: Number, default: null, min: 0, max: MAX_YEARS_EXPERIENCE })
  yearsExperience: number | null;

  // The card's colour scheme. A closed list, not a free colour, so every
  // card stays inside the app's palette.
  @Prop({ type: String, enum: CARD_ACCENTS, default: DEFAULT_CARD_ACCENT })
  cardAccent: string;

  // The attached CV, denormalized from the professional_cvs document so that
  // rendering a card never needs a second query — and never touches the
  // bytes. Null until one is uploaded; all three move together.
  @Prop({ type: String, default: null })
  cvUrl: string | null;

  @Prop({ type: String, default: null })
  cvFileName: string | null;

  @Prop({ type: String, default: null })
  cvContentType: string | null;

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
