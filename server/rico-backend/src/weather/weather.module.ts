import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cors from 'cors';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';

@Module({
  providers: [WeatherService],
  controllers: [WeatherController],
  exports: [WeatherService],
})
export class WeatherModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Same reason /search and /compose are CORS-enabled: the Flutter web
    // build calls this cross-origin.
    consumer.apply(cors()).forRoutes({ path: 'weather', method: RequestMethod.GET });
  }
}
