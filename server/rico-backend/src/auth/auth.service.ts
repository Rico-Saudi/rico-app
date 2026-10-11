import { Injectable } from '@nestjs/common';
import { AccountsService } from '../accounts/accounts.service';
import { MailerService } from '../mailer/mailer.service';

export const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  message: 'إذا كان هذا البريد مسجلاً، سنرسل رابط إعادة تعيين كلمة المرور إليه.',
};

@Injectable()
export class AuthService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly mailerService: MailerService,
  ) {}

  async login(email: string, password: string, app: 'owner' | 'vendor') {
    return this.accountsService.verifyLogin(email, password, app);
  }

  async me(accountId: string) {
    return this.accountsService.me(accountId);
  }

  // Always returns the generic response regardless of whether the email is
  // known/active — anti account-enumeration, same pattern the old
  // magic-link login used.
  async forgotPassword(
    rawEmail: string,
    app: 'owner' | 'vendor',
    baseUrl: string,
  ): Promise<typeof GENERIC_FORGOT_PASSWORD_RESPONSE> {
    const account = await this.accountsService.findActiveAccountForReset(rawEmail, app);
    if (account) {
      const token = await this.accountsService.createPasswordToken(String(account._id), 'reset');
      const link = `${baseUrl}/${app}/set-password?token=${token}`;
      try {
        await this.mailerService.sendPasswordSetupEmail({ email: account.email, link, purpose: 'reset' });
      } catch (e) {
        console.error('Failed to send password reset email:', (e as Error).message || e);
      }
    }
    return GENERIC_FORGOT_PASSWORD_RESPONSE;
  }

  async setPassword(token: string, password: string) {
    return this.accountsService.setPasswordFromToken(token, password);
  }
}
