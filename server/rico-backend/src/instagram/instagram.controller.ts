import { Controller, Delete, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { InstagramService } from './instagram.service';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';
import { AccountId } from '../common/decorators/account-id.decorator';

@Controller('vendor/instagram')
@UseGuards(SessionGuard)
@RequireApp('vendor')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('status')
  status(@AccountId() accountId: string, @Query('businessId') businessId: string) {
    return this.instagramService.status(accountId, businessId);
  }

  @Get('connect')
  connect(@AccountId() accountId: string, @Query('businessId') businessId: string) {
    return this.instagramService.connectUrl(accountId, businessId);
  }

  /// Instagram redirects the vendor's browser here. It carries their session
  /// cookie, so the guard above identifies them; the signed `state` proves the
  /// flow is the one they started, for the business they started it for.
  ///
  /// Ends in a redirect rather than JSON because a person is looking at it.
  @Get('callback')
  async callback(
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
  import(@AccountId() accountId: string, @Query('businessId') businessId: string) {
    return this.instagramService.importOffers(accountId, businessId);
  }

  @Delete('disconnect')
  disconnect(@AccountId() accountId: string, @Query('businessId') businessId: string) {
    return this.instagramService.disconnect(accountId, businessId);
  }
}
