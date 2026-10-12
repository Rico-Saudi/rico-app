import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiUsageModule } from '../api-usage/api-usage.module';
import { LlmModule } from '../llm/llm.module';
import { webOffersLimiter } from '../common/middleware/rate-limiters';
import { WebOfferCache, WebOfferCacheSchema } from './schemas/web-offer-cache.schema';
import { WebOffersController } from './web-offers.controller';
import { WebOffersService } from './web-offers.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebOfferCache.name, schema: WebOfferCacheSchema }]),
    ApiUsageModule,
    LlmModule,
  ],
  controllers: [WebOffersController],
  providers: [WebOffersService],
  exports: [WebOffersService],
})
export class WebOffersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(webOffersLimiter)
      .forRoutes({ path: 'web-offers/deals', method: RequestMethod.POST }, { path: 'web-offers/prices', method: RequestMethod.POST });
  }
}
