import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { Account, AccountDocument } from '../../accounts/schemas/account.schema';

// Replaces OwnerOnlyGuard — stricter than SessionGuard+RequireApp('owner'):
// requires platformRole==='owner', not just any owner-dashboard session.
// Use for staff-management routes only. Reads platformRole fresh from the
// database (not the session) so a demotion takes effect immediately on that
// account's already-open session, not just on its next login.
@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(@InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.session?.accountId || req.session.app !== 'owner') {
      throw new UnauthorizedException({ error: 'unauthorized' });
    }

    const account = await this.accountModel.findById(req.session.accountId).lean();
    if (!account || !account.isActive || account.app !== 'owner') {
      throw new UnauthorizedException({ error: 'unauthorized' });
    }
    if (account.platformRole !== 'owner') {
      throw new ForbiddenException({ error: 'owner_role_required' });
    }
    return true;
  }
}
