import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountsModule } from '../accounts/accounts.module';
import { MailerModule } from '../mailer/mailer.module';
import { loginIpLimiter, loginEmailLimiter } from '../common/middleware/rate-limiters';

@Module({
  imports: [AccountsModule, MailerModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(loginIpLimiter, loginEmailLimiter)
      .forRoutes(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
      );
  }
}
