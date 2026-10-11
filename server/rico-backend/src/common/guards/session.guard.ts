import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { REQUIRE_APP_KEY } from '../decorators/require-app.decorator';
import { Account, AccountDocument } from '../../accounts/schemas/account.schema';

// Replaces OwnerSessionGuard/BusinessSessionGuard: any authenticated
// account, optionally narrowed to one dashboard's app via @RequireApp().
//
// Re-checks isActive/app against the database on every request (not just at
// login) — a session cookie alone isn't enough proof of current standing,
// since an account can be disabled, or a staff member's role changed, after
// the session was issued. Without this, disabling an account would only
// block its *next* login, not its already-open session.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session?.accountId) {
      throw new UnauthorizedException({ error: 'unauthorized' });
    }

    const account = await this.accountModel.findById(req.session.accountId).lean();
    if (!account || !account.isActive) {
      throw new UnauthorizedException({ error: 'unauthorized' });
    }

    const requiredApp = this.reflector.getAllAndOverride<'owner' | 'vendor' | undefined>(REQUIRE_APP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredApp && account.app !== requiredApp) {
      throw new ForbiddenException({ error: 'wrong_app' });
    }

    return true;
  }
}
