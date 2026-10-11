import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { AccountId } from '../common/decorators/account-id.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const account = await this.authService.login(dto.email, dto.password, dto.app);

    // Regenerate the session on login (prevents session fixation) before
    // setting the authenticated accountId — same pattern the old owner/business logins used.
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.accountId = account.id;
    req.session.app = account.app;
    if (account.platformRole) req.session.platformRole = account.platformRole;

    return account;
  }

  @Post('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    req.session.destroy(() => res.json({ ok: true }));
  }

  @UseGuards(SessionGuard)
  @Get('me')
  me(@AccountId() accountId: string) {
    return this.authService.me(accountId);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return this.authService.forgotPassword(dto.email, dto.app, baseUrl);
  }

  @Post('set-password')
  setPassword(@Body() dto: SetPasswordDto) {
    return this.authService.setPassword(dto.token, dto.password);
  }
}
