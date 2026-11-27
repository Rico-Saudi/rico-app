import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { appCors } from '../common/middleware/app-cors';
import { composeLimiter } from '../common/middleware/rate-limiters';
import { ComposeService } from './compose.service';
import { ComposeController } from './compose.controller';
import { LlmModule } from '../llm/llm.module';
import { WeatherModule } from '../weather/weather.module';

@Module({
  imports: [LlmModule, WeatherModule],
  controllers: [ComposeController],
  providers: [ComposeService],
})
export class ComposeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(appCors, composeLimiter)
      .forRoutes({ path: 'compose', method: RequestMethod.POST });
  }
}
