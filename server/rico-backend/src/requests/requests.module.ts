import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerRequest, CustomerRequestSchema } from './schemas/request.schema';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { ProductsModule } from '../products/products.module';
import { DealsModule } from '../deals/deals.module';
import { CustomersModule } from '../customers/customers.module';
import { submitDealLimiter } from '../common/middleware/rate-limiters';
import { OrderNotifierService } from './order-notifier.service';
import { MailerModule } from '../mailer/mailer.module';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';
import { BusinessClaim, BusinessClaimSchema } from '../vendor/schemas/business-claim.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomerRequest.name, schema: CustomerRequestSchema },
      // Read-only here: who runs the shop, so they can be told about an order.
      { name: BusinessClaim.name, schema: BusinessClaimSchema },
      { name: Account.name, schema: AccountSchema },
    ]),
    MailerModule,
    BusinessesModule,
    ProductsModule,
    DealsModule,
    CustomersModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService, OrderNotifierService],
  exports: [MongooseModule, RequestsService],
})
export class RequestsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(submitDealLimiter).forRoutes({ path: 'requests', method: RequestMethod.POST });
  }
}
