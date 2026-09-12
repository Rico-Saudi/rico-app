import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { CustomerOtp, CustomerOtpSchema } from './schemas/customer-otp.schema';
import { CustomerToken, CustomerTokenSchema } from './schemas/customer-token.schema';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { CustomerAuthGuard, OptionalCustomerAuthGuard } from './customer-auth.guard';
import { MailerModule } from '../mailer/mailer.module';
import {
  customerEmailLimiter,
  customerIpLimiter,
  customerOtpSendLimiter,
} from '../common/middleware/rate-limiters';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: CustomerOtp.name, schema: CustomerOtpSchema },
      { name: CustomerToken.name, schema: CustomerTokenSchema },
    ]),
    MailerModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerAuthGuard, OptionalCustomerAuthGuard],
  exports: [MongooseModule, CustomersService, CustomerAuthGuard, OptionalCustomerAuthGuard],
})
export class CustomersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every endpoint that takes an email and either checks a credential or
    // sends mail is capped twice: by IP and by the target address. The
    // per-address cap is what stops someone using a stranger's inbox as a
    // mailbomb target, which an IP cap alone wouldn't.
    consumer
      .apply(customerIpLimiter, customerEmailLimiter)
      .forRoutes(
        { path: 'customer/auth/login', method: RequestMethod.POST },
        { path: 'customer/auth/verify-email', method: RequestMethod.POST },
        { path: 'customer/auth/reset-password', method: RequestMethod.POST },
      );

    consumer
      .apply(customerIpLimiter, customerOtpSendLimiter)
      .forRoutes(
        { path: 'customer/auth/register', method: RequestMethod.POST },
        { path: 'customer/auth/resend-otp', method: RequestMethod.POST },
        { path: 'customer/auth/forgot-password', method: RequestMethod.POST },
      );
  }
}
