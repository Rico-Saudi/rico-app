import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { CustomersService } from './customers.service';

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/// Requires a valid app-customer bearer token.
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly customersService: CustomersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(req);
    if (!token) throw new UnauthorizedException({ error: 'unauthorized' });

    req.customer = await this.customersService.authenticate(token);
    req.customerToken = token;
    return true;
  }
}

// For endpoints that predate customer accounts and still have to serve
// clients already in users' hands (POST /requests): no header means
// anonymous, as before. A header that IS present still has to be valid —
// failing open on an expired token would silently drop the request's link
// to its customer, and the app would never learn it needs to log in again.
@Injectable()
export class OptionalCustomerAuthGuard implements CanActivate {
  constructor(private readonly customersService: CustomersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(req);
    if (!token) return true;

    req.customer = await this.customersService.authenticate(token);
    req.customerToken = token;
    return true;
  }
}
