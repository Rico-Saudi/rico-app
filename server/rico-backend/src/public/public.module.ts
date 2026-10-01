import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import cors from 'cors';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { DealsModule } from '../deals/deals.module';
import { ProductsModule } from '../products/products.module';
import { VendorImpression, VendorImpressionSchema } from './schemas/vendor-impression.schema';
import { SearchGap, SearchGapSchema } from './schemas/search-gap.schema';
import { CatalogGap, CatalogGapSchema } from './schemas/catalog-gap.schema';
import { CustomerRequest, CustomerRequestSchema } from '../requests/schemas/request.schema';
import { submitDealLimiter, impressionLimiter } from '../common/middleware/rate-limiters';

@Module({
  imports: [
    BusinessesModule,
    DealsModule,
    ProductsModule,
    MongooseModule.forFeature([
      { name: VendorImpression.name, schema: VendorImpressionSchema },
      { name: SearchGap.name, schema: SearchGapSchema },
      { name: CatalogGap.name, schema: CatalogGapSchema },
      // Read-only here: "اختر لي وجبة" leans on what other customers actually
      // asked this shop for. Writing requests stays with RequestsModule.
      { name: CustomerRequest.name, schema: CustomerRequestSchema },
    ]),
  ],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [MongooseModule],
})
export class PublicModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cors()).forRoutes(
      { path: 'places/search', method: RequestMethod.GET },
      { path: 'submit-deal', method: RequestMethod.POST },
      { path: 'impressions', method: RequestMethod.POST },
      { path: 'search-gaps', method: RequestMethod.POST },
    );
    consumer.apply(submitDealLimiter).forRoutes({ path: 'submit-deal', method: RequestMethod.POST });
    consumer.apply(impressionLimiter).forRoutes(
      { path: 'impressions', method: RequestMethod.POST },
      { path: 'search-gaps', method: RequestMethod.POST },
    );
  }
}
