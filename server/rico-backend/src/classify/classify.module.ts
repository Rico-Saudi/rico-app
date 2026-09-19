import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cors from 'cors';
import { ClassifyService } from './classify.service';
import { ClassifyController } from './classify.controller';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [ClassifyController],
  providers: [ClassifyService],
})
export class ClassifyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cors()).forRoutes({ path: 'classify', method: RequestMethod.POST });
  }
}
