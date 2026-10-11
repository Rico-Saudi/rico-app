import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cors from 'cors';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { ProductsModule } from '../products/products.module';
import { ApiUsageModule } from '../api-usage/api-usage.module';
import { PhotosModule } from '../photos/photos.module';

@Module({
  imports: [BusinessesModule, ProductsModule, ApiUsageModule, PhotosModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cors()).forRoutes(
      { path: 'search', method: RequestMethod.GET },
      { path: 'search/products', method: RequestMethod.GET },
    );
  }
}
