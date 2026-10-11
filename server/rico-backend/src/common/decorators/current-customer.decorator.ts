import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { CustomerDocument } from '../../customers/schemas/customer.schema';

/// The authenticated app customer, as resolved by CustomerAuthGuard.
export const CurrentCustomer = createParamDecorator((_data: unknown, ctx: ExecutionContext): CustomerDocument => {
  return ctx.switchToHttp().getRequest<Request>().customer as CustomerDocument;
});

/// The raw bearer token of the current request — only needed by logout,
/// which revokes exactly the token it was called with.
export const CustomerToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<Request>().customerToken as string;
});
