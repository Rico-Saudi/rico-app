import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AccountDocument = HydratedDocument<Account>;

export const ACCOUNT_APPS = ['owner', 'vendor'] as const;
export type AccountApp = (typeof ACCOUNT_APPS)[number];

export const PLATFORM_ROLES = ['owner', 'staff'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// Single account/role model replacing the old OwnerAccount/BusinessAccount
// split. `app` gates which dashboard the account may log into; `platformRole`
// is only meaningful (and only ever set) for app='owner' — a vendor account
// never carries a platform role, it's scoped entirely via BusinessClaim.
@Schema({ timestamps: true })
export class Account {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // null until an invited vendor (or a forgot-password requester) consumes a
  // PasswordResetToken and sets one — see AuthService.setPassword.
  @Prop({ type: String, default: null })
  passwordHash: string | null;

  @Prop({ type: String, required: true, enum: ACCOUNT_APPS })
  app: AccountApp;

  @Prop({ type: String, enum: PLATFORM_ROLES, default: null })
  platformRole: PlatformRole | null;

  // Soft-disable instead of deletion — keeps audit-log/attribution history
  // intact for a departed staff member or removed vendor.
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;
}

export const AccountSchema = SchemaFactory.createForClass(Account);
