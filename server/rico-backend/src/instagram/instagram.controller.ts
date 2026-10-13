import { Controller, Delete, Get, Header, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { InstagramService } from './instagram.service';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';
import { AccountId } from '../common/decorators/account-id.decorator';
import { MongoIdPipe } from '../common/pipes/mongo-id.pipe';

@Controller('vendor/instagram')
@UseGuards(SessionGuard)
@RequireApp('vendor')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('status')
  status(@AccountId() accountId: string, @Query('businessId', new MongoIdPipe()) businessId: string) {
    return this.instagramService.status(accountId, businessId);
  }

  @Get('connect')
  connect(@AccountId() accountId: string, @Query('businessId', new MongoIdPipe()) businessId: string) {
    return this.instagramService.connectUrl(accountId, businessId);
  }

  /// Where [InstagramCallbackController] bounces the browser. Reached by a
  /// navigation that starts on our own page, so the session cookie rides
  /// along and the guard above identifies the vendor; the signed `state`
  /// proves the flow is the one they started, for the business they started
  /// it for.
  ///
  /// Ends in a redirect rather than JSON because a person is looking at it.
  @Get('complete')
  async complete(
    @AccountId() accountId: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error || !code) {
      // The vendor declined on Instagram's screen, which is an answer, not a
      // failure worth an error page.
      res.redirect('/vendor/dashboard?tab=settings&instagram=cancelled');
      return;
    }

    try {
      await this.instagramService.completeConnection(accountId, code, state);
      res.redirect('/vendor/dashboard?tab=settings&instagram=connected');
    } catch {
      res.redirect('/vendor/dashboard?tab=settings&instagram=failed');
    }
  }

  @Post('import')
  import(@AccountId() accountId: string, @Query('businessId', new MongoIdPipe()) businessId: string) {
    return this.instagramService.importOffers(accountId, businessId);
  }

  @Delete('disconnect')
  disconnect(@AccountId() accountId: string, @Query('businessId', new MongoIdPipe()) businessId: string) {
    return this.instagramService.disconnect(accountId, businessId);
  }
}

/// The redirect URI registered with Instagram (INSTAGRAM_REDIRECT_URI).
///
/// Deliberately unguarded. The session cookie is `sameSite: 'strict'`, and a
/// navigation that arrives from instagram.com is cross-site, so the browser
/// withholds the cookie here and the guard would answer 401 every time.
/// This page sends nothing but a script that navigates to /complete — a
/// navigation our own page starts, which is same-site, so the cookie goes
/// with it. Only `code`, `state` and `error` are forwarded, and nothing is
/// trusted until the guarded handler has checked the session and the state.
@Controller('vendor/instagram')
export class InstagramCallbackController {
  @Get('callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  callback(@Query('code') code: unknown, @Query('state') state: unknown, @Query('error') error: unknown): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ code, state, error })) {
      if (typeof value === 'string' && value) params.set(key, value);
    }
    const target = JSON.stringify(`/vendor/instagram/complete?${params.toString()}`).replace(/</g, '\\u003c');
    return `<!doctype html><meta charset="utf-8"><title>Rico</title><script>location.replace(${target});</script>`;
  }
}
