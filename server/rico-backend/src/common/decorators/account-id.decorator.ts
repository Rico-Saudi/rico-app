import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

// Replaces OwnerId/BusinessId — one decorator for either dashboard's
// authenticated account id, since both now share the same session shape.
export const AccountId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.session.accountId as string;
});
