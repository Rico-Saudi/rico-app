import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Account, AccountDocument, PlatformRole } from './schemas/account.schema';
import { PasswordResetToken, PasswordResetTokenDocument } from './schemas/password-reset-token.schema';
import { generateToken, hashPassword, hashToken, verifyPassword } from '../common/utils/auth.util';

const DEFAULT_OWNER_EMAIL = 'owner@rico.app';
const DEFAULT_OWNER_PASSWORD = 'ChangeMe123!';
const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // invite/reset links last a day, unlike the old 15-minute magic link

// Fixed scrypt hash used only to normalize verifyLogin's timing when no
// real account/password exists to compare against — never a real credential.
const DUMMY_PASSWORD_HASH = hashPassword('rico_timing_normalization_dummy');

@Injectable()
export class AccountsService implements OnModuleInit {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(PasswordResetToken.name) private readonly tokenModel: Model<PasswordResetTokenDocument>,
  ) {}

  // First-run bootstrap only — if any owner-app account already exists this
  // is a no-op, so a manually-set password is never silently overwritten on
  // every restart. Set OWNER_EMAIL/OWNER_PASSWORD before the first boot to
  // control the initial login; otherwise a documented dev-only default is used.
  async onModuleInit(): Promise<void> {
    const existing = await this.accountModel.countDocuments({ app: 'owner' });
    if (existing > 0) return;

    const email = (process.env.OWNER_EMAIL || DEFAULT_OWNER_EMAIL).trim().toLowerCase();
    const password = process.env.OWNER_PASSWORD || DEFAULT_OWNER_PASSWORD;
    await this.accountModel.create({
      email,
      passwordHash: hashPassword(password),
      app: 'owner',
      platformRole: 'owner',
    });

    if (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD) {
      this.logger.warn(
        `Created default owner account ${email} with a well-known password — set OWNER_EMAIL/OWNER_PASSWORD env vars and log in again to change it.`,
      );
    } else {
      this.logger.log(`Created owner account ${email} from OWNER_EMAIL/OWNER_PASSWORD.`);
    }
  }

  async verifyLogin(rawEmail: string, password: string, app: 'owner' | 'vendor') {
    const email = (rawEmail || '').trim().toLowerCase();
    const account = await this.accountModel.findOne({ email });

    // Always run the scrypt comparison, even for an unknown/inactive/
    // passwordless account — hashing against a fixed dummy value keeps this
    // branch's timing close to the "account exists, wrong password" branch
    // below, instead of returning immediately and leaking account existence
    // through response latency.
    if (!account || !account.isActive || !account.passwordHash) {
      verifyPassword(password || '', DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException({ error: 'invalid_credentials' });
    }
    if (account.app !== app) {
      throw new UnauthorizedException({ error: 'wrong_app', app: account.app });
    }
    if (!verifyPassword(password || '', account.passwordHash)) {
      throw new UnauthorizedException({ error: 'invalid_credentials' });
    }

    account.lastLoginAt = new Date();
    await account.save();
    return { id: String(account._id), email: account.email, app: account.app, platformRole: account.platformRole };
  }

  async me(accountId: string) {
    const account = await this.accountModel.findById(accountId).lean();
    if (!account || !account.isActive) throw new UnauthorizedException({ error: 'unauthorized' });
    return { id: String(account._id), email: account.email, app: account.app, platformRole: account.platformRole };
  }

  async findByEmail(rawEmail: string): Promise<AccountDocument | null> {
    return this.accountModel.findOne({ email: (rawEmail || '').trim().toLowerCase() });
  }

  // Owner-invited vendor accounts are created without a password — the
  // vendor sets one via the emailed invite token (createPasswordToken below).
  async createVendorAccount(rawEmail: string) {
    const email = (rawEmail || '').trim().toLowerCase();
    const existing = await this.accountModel.findOne({ email }).lean();
    if (existing) throw new ConflictException({ error: 'email_already_exists' });

    return this.accountModel.create({ email, passwordHash: null, app: 'vendor', platformRole: null });
  }

  async createPasswordToken(accountId: string, purpose: 'invite' | 'reset'): Promise<string> {
    const { token, tokenHash } = generateToken();
    await this.tokenModel.create({
      tokenHash,
      accountId,
      purpose,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
    return token;
  }

  async setPasswordFromToken(rawToken: string, password: string): Promise<{ accountId: string; app: string }> {
    if (!rawToken) throw new BadRequestException({ error: 'invalid_token' });

    const tokenHash = hashToken(rawToken);
    const record = await this.tokenModel.findOneAndUpdate(
      { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    );
    if (!record) throw new BadRequestException({ error: 'invalid_or_expired_token' });

    const account = await this.accountModel.findByIdAndUpdate(
      record.accountId,
      { passwordHash: hashPassword(password) },
      { new: true },
    );
    if (!account) throw new NotFoundException({ error: 'account_not_found' });

    return { accountId: String(account._id), app: account.app };
  }

  // Called by /auth/forgot-password — always resolves without revealing
  // whether the email exists (anti account-enumeration); caller decides
  // whether/what to email based on the returned account (null if unknown).
  async findActiveAccountForReset(rawEmail: string, app: 'owner' | 'vendor'): Promise<AccountDocument | null> {
    const email = (rawEmail || '').trim().toLowerCase();
    return this.accountModel.findOne({ email, app, isActive: true });
  }

  async listStaff() {
    const accounts = await this.accountModel.find({ app: 'owner' }).sort({ createdAt: 1 }).lean();
    return {
      items: accounts.map((a) => ({
        id: a._id,
        email: a.email,
        role: a.platformRole,
        isActive: a.isActive,
        lastLoginAt: a.lastLoginAt,
      })),
    };
  }

  async createStaff(email: string, password: string, role: PlatformRole) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.accountModel.findOne({ email: normalizedEmail }).lean();
    if (existing) throw new ConflictException({ error: 'email_already_exists' });

    const created = await this.accountModel.create({
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      app: 'owner',
      platformRole: role,
    });
    return { id: created._id, email: created.email, role: created.platformRole };
  }

  async updateStaff(requesterId: string, targetId: string, updates: { role?: PlatformRole; isActive?: boolean }) {
    if (requesterId === targetId && (updates.role === 'staff' || updates.isActive === false)) {
      throw new BadRequestException({ error: 'cannot_demote_or_disable_self' });
    }

    const target = await this.accountModel.findOne({ _id: targetId, app: 'owner' });
    if (!target) throw new NotFoundException({ error: 'account_not_found' });

    if ((updates.role === 'staff' || updates.isActive === false) && target.platformRole === 'owner') {
      const remainingActiveOwners = await this.accountModel.countDocuments({
        app: 'owner',
        platformRole: 'owner',
        isActive: true,
        _id: { $ne: targetId },
      });
      if (remainingActiveOwners === 0) {
        throw new ForbiddenException({ error: 'last_owner_cannot_be_demoted' });
      }
    }

    if (updates.role !== undefined) target.platformRole = updates.role;
    if (updates.isActive !== undefined) target.isActive = updates.isActive;
    await target.save();

    return { id: target._id, email: target.email, role: target.platformRole, isActive: target.isActive };
  }
}
