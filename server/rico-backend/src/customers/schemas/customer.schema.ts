import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

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
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
