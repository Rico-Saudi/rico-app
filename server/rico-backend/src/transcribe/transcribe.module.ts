import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cors from 'cors';
import { transcribeLimiter } from '../common/middleware/rate-limiters';
import { TranscribeController } from './transcribe.controller';
import { TranscribeService } from './transcribe.service';

@Module({
  controllers: [TranscribeController],
  providers: [TranscribeService],
})
export class TranscribeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cors()).forRoutes({ path: 'transcribe', method: RequestMethod.POST });
    consumer.apply(transcribeLimiter).forRoutes({ path: 'transcribe', method: RequestMethod.POST });
  }
}
