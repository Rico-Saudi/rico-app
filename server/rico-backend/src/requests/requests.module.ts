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

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerRequest.name, schema: CustomerRequestSchema }]),
    BusinessesModule,
    ProductsModule,
    DealsModule,
    CustomersModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [MongooseModule, RequestsService],
})
export class RequestsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(submitDealLimiter).forRoutes({ path: 'requests', method: RequestMethod.POST });
  }
}
