import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import crypto from 'node:crypto';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument, DEFAULT_SERVICE_RADIUS_METERS } from './schemas/customer.schema';
import { CustomerOtp, CustomerOtpDocument, OtpPurpose } from './schemas/customer-otp.schema';
import { CustomerToken, CustomerTokenDocument } from './schemas/customer-token.schema';
import { MailerService } from '../mailer/mailer.service';
import { brandFor } from '../common/constants/brands';
import { generateOtpCode, generateToken, hashPassword, hashToken, verifyPassword } from '../common/utils/auth.util';
import { professionLabel } from '../professionals/constants/professions';
import { UpdateCustomerProfileDto } from './dto/update-profile.dto';

export const OTP_TTL_MINUTES = 10;
const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // same horizon as the dashboards' session cookie

// Same rationale as AccountsService: hash against a fixed dummy value when
// there's no real password to compare, so "unknown email" and "wrong
// password" take comparable time and response latency doesn't reveal which
// addresses are registered.
const DUMMY_PASSWORD_HASH = hashPassword('rico_customer_timing_normalization_dummy');

// Returned by forgot-password/resend regardless of whether the address is
// registered — anti account-enumeration, same stance as the dashboard's
// forgot-password.
export const GENERIC_OTP_RESPONSE = {
  status: 'otp_sent' as const,
  message: 'إذا كان البريد مسجّلاً، أرسلنا له رمزاً مكوّناً من ٦ أرقام.',
  expiresInSeconds: OTP_TTL_MS / 1000,
};

export interface CustomerProfessionalProfile {
  profession: string;
  professionLabel: string;
  headline: string | null;
  lat: number;
  lng: number;
  serviceRadiusMeters: number;
  isAvailable: boolean;
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  /** null unless this person offers a trade — see ProfessionalProfile. */
  professional: CustomerProfessionalProfile | null;
}

export interface CustomerSession {
  token: string;
  expiresAt: Date;
  customer: CustomerProfile;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(CustomerOtp.name) private readonly otpModel: Model<CustomerOtpDocument>,
    @InjectModel(CustomerToken.name) private readonly tokenModel: Model<CustomerTokenDocument>,
    private readonly mailerService: MailerService,
  ) {}

  // ─── Registration & verification ────────────────────────────────────────

  async register(input: { name: string; email: string; password: string; phone: string; brand?: string }) {
    const email = normalizeEmail(input.email);
    const existing = await this.customerModel.findOne({ email });

    // A half-finished signup (registered, never verified) isn't an account
    // yet — nobody has proven they own the address, so re-registering over
    // it is the expected recovery path, not a conflict. A verified one is a
    // real account and must not be overwritten by whoever types the address.
    if (existing?.emailVerified) {
      throw new ConflictException({ error: 'email_already_exists' });
    }

    const customer =
      existing ??
      new this.customerModel({
        email,
        name: input.name.trim(),
        phone: input.phone.trim(),
        passwordHash: hashPassword(input.password),
      });

    if (existing) {
      existing.name = input.name.trim();
      existing.phone = input.phone.trim();
      existing.passwordHash = hashPassword(input.password);
    }
    await customer.save();

    await this.issueOtp(customer, 'verify_email', input.brand);
    return { status: 'otp_sent' as const, email, expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  async verifyEmail(rawEmail: string, code: string): Promise<CustomerSession> {
    const customer = await this.requireCustomer(rawEmail);
    await this.consumeOtp(customer, 'verify_email', code);

    customer.emailVerified = true;
    customer.lastLoginAt = new Date();
    await customer.save();

    return this.issueSession(customer);
  }

  // Deliberately generic: the response is identical for an unknown address,
  // an already-verified one, and a real resend, so this can't be used to
  // probe which emails have accounts.
  async resendOtp(rawEmail: string, purpose: OtpPurpose, brand?: string) {
    const customer = await this.customerModel.findOne({ email: normalizeEmail(rawEmail), isActive: true });
    const applicable =
      customer && (purpose === 'reset_password' ? customer.emailVerified : !customer.emailVerified);
    if (applicable) {
      await this.issueOtp(customer, purpose, brand);
    }
    return GENERIC_OTP_RESPONSE;
  }

  // ─── Login ──────────────────────────────────────────────────────────────

  async login(rawEmail: string, password: string, brand?: string): Promise<CustomerSession> {
    const email = normalizeEmail(rawEmail);
    const customer = await this.customerModel.findOne({ email });

    if (!customer || !customer.isActive) {
      verifyPassword(password || '', DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException({ error: 'invalid_credentials' });
    }
    if (!verifyPassword(password || '', customer.passwordHash)) {
      throw new UnauthorizedException({ error: 'invalid_credentials' });
    }

    // Right password, unverified address: send a fresh code and tell the app
    // to show the OTP step rather than the generic error — this is the
    // normal path for someone who closed the app mid-signup.
    if (!customer.emailVerified) {
      await this.issueOtp(customer, 'verify_email', brand);
      throw new ForbiddenException({
        error: 'email_not_verified',
        email: customer.email,
        expiresInSeconds: OTP_TTL_MS / 1000,
      });
    }

    customer.lastLoginAt = new Date();
    await customer.save();
    return this.issueSession(customer);
  }

  // ─── Password reset ─────────────────────────────────────────────────────

  async forgotPassword(rawEmail: string, brand?: string) {
    const customer = await this.customerModel.findOne({
      email: normalizeEmail(rawEmail),
      isActive: true,
      emailVerified: true,
    });
    if (customer) await this.issueOtp(customer, 'reset_password', brand);
    return GENERIC_OTP_RESPONSE;
  }

  async resetPassword(rawEmail: string, code: string, password: string): Promise<CustomerSession> {
    const customer = await this.requireCustomer(rawEmail);
    await this.consumeOtp(customer, 'reset_password', code);

    customer.passwordHash = hashPassword(password);
    customer.lastLoginAt = new Date();
    await customer.save();

    // Every other device is logged out: a reset is the one action a person
    // takes when they suspect someone else has their password, and leaving
    // that someone else's token alive would defeat the point.
    await this.tokenModel.deleteMany({ customerId: customer._id });

    return this.issueSession(customer);
  }

  // ─── Session ────────────────────────────────────────────────────────────

  // Used by CustomerAuthGuard on every authenticated request. Re-reads the
  // customer (not just the token) so a disabled account loses access
  // immediately instead of at its token's expiry a year later.
  async authenticate(rawToken: string): Promise<CustomerDocument> {
    const record = await this.tokenModel.findOne({
      tokenHash: hashToken(rawToken),
      expiresAt: { $gt: new Date() },
    });
    if (!record) throw new UnauthorizedException({ error: 'unauthorized' });

    const customer = await this.customerModel.findById(record.customerId);
    if (!customer || !customer.isActive || !customer.emailVerified) {
      throw new UnauthorizedException({ error: 'unauthorized' });
    }

    // Fire-and-forget: last-seen bookkeeping must never add latency to, or
    // fail, the request it's describing.
    this.tokenModel
      .updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return customer;
  }

  async logout(rawToken: string) {
    await this.tokenModel.deleteOne({ tokenHash: hashToken(rawToken) });
    return { ok: true };
  }

  async updateProfile(customer: CustomerDocument, updates: UpdateCustomerProfileDto) {
    if (updates.name !== undefined) customer.name = updates.name.trim();
    if (updates.phone !== undefined) customer.phone = updates.phone.trim();

    // Three cases, distinguished by JS's own absent/null split: key omitted
    // (leave the trade alone — every plain name/phone edit), explicit null
    // (stop offering the trade), or an object (set or replace it).
    if (updates.professional === null) {
      customer.professional = null;
    } else if (updates.professional !== undefined) {
      const next = updates.professional;
      customer.professional = {
        profession: next.profession,
        headline: next.headline?.trim() || null,
        serviceLocation: { type: 'Point', coordinates: [next.lng, next.lat] },
        serviceRadiusMeters: next.serviceRadiusMeters ?? DEFAULT_SERVICE_RADIUS_METERS,
        // Editing your trade shouldn't quietly take you offline, so an
        // omitted flag keeps the current value (true for a new profile).
        isAvailable: next.isAvailable ?? customer.professional?.isAvailable ?? true,
      };
    }

    await customer.save();
    return toProfile(customer);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async issueSession(customer: CustomerDocument): Promise<CustomerSession> {
    const { token, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.tokenModel.create({ tokenHash, customerId: customer._id, expiresAt });
    return { token, expiresAt, customer: toProfile(customer) };
  }

  private async issueOtp(customer: CustomerDocument, purpose: OtpPurpose, brand?: string): Promise<void> {
    // One live code per purpose: issuing a new one retires the old, so a
    // code read from an older email can't be used after a resend.
    await this.otpModel.deleteMany({ customerId: customer._id, purpose, usedAt: null });

    const code = generateOtpCode();
    await this.otpModel.create({
      codeHash: hashToken(code),
      customerId: customer._id,
      purpose,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    try {
      await this.mailerService.sendOtpEmail({
        email: customer.email,
        name: customer.name,
        code,
        purpose,
        brandName: brandFor(brand).name,
        ttlMinutes: OTP_TTL_MINUTES,
      });
    } catch (e) {
      // Surfaced rather than swallowed: the code only exists in that email,
      // so a silent failure would leave the app waiting for something that
      // is never arriving. The account row stays — /resend-otp retries.
      this.logger.error(`Failed to send ${purpose} code to ${customer.email}: ${(e as Error).message || e}`);
      throw new BadGatewayException({ error: 'email_send_failed' });
    }
  }

  private async consumeOtp(customer: CustomerDocument, purpose: OtpPurpose, code: string): Promise<void> {
    const otp = await this.otpModel
      .findOne({ customerId: customer._id, purpose, usedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 });
    if (!otp) throw new BadRequestException({ error: 'invalid_or_expired_code' });

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      otp.usedAt = new Date();
      await otp.save();
      throw new BadRequestException({ error: 'too_many_attempts' });
    }

    if (!timingSafeEqualHex(hashToken((code || '').trim()), otp.codeHash)) {
      otp.attempts += 1;
      // Burn the code on the last allowed miss instead of leaving it usable:
      // six digits is a small space, and the cap is only real if the code
      // actually dies when it's reached.
      if (otp.attempts >= OTP_MAX_ATTEMPTS) otp.usedAt = new Date();
      await otp.save();
      throw new BadRequestException({
        error: 'invalid_or_expired_code',
        attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - otp.attempts),
      });
    }

    otp.usedAt = new Date();
    await otp.save();
  }

  // Verify/reset are reached only with a code that was emailed to this
  // address, so naming an unknown address here is a client bug, not a probe
  // — the generic error keeps it from doubling as an enumeration oracle
  // anyway.
  private async requireCustomer(rawEmail: string): Promise<CustomerDocument> {
    const customer = await this.customerModel.findOne({ email: normalizeEmail(rawEmail), isActive: true });
    if (!customer) throw new BadRequestException({ error: 'invalid_or_expired_code' });
    return customer;
  }
}

function normalizeEmail(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function toProfile(customer: CustomerDocument | (Customer & { _id: Types.ObjectId })): CustomerProfile {
  const pro = customer.professional;
  return {
    id: String(customer._id),
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    emailVerified: customer.emailVerified,
    professional: pro
      ? {
          profession: pro.profession,
          // Resolved server-side so the app renders the right Arabic name
          // for a trade added after that build shipped.
          professionLabel: professionLabel(pro.profession),
          headline: pro.headline ?? null,
          lat: pro.serviceLocation.coordinates[1],
          lng: pro.serviceLocation.coordinates[0],
          serviceRadiusMeters: pro.serviceRadiusMeters,
          isAvailable: pro.isAvailable,
        }
      : null,
  };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length || bufferA.length === 0) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}
