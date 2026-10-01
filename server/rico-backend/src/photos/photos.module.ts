import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cors from 'cors';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { ApiUsageModule } from '../api-usage/api-usage.module';

@Module({
  imports: [BusinessesModule, ApiUsageModule],
  controllers: [PhotosController],
  providers: [PhotosService],
  // SearchModule holds the pending-reference cache warm by calling
  // rememberPendingRef for places Google just returned.
  exports: [PhotosService],
})
export class PhotosModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Same reason /search is CORS-enabled: the Flutter web build fetches this
    // cross-origin, and an <img> there is subject to the same policy.
    consumer.apply(cors()).forRoutes({ path: 'places/:id/photo', method: RequestMethod.GET });
  }
}
