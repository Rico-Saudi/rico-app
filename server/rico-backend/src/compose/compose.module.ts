import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cors from 'cors';
import { ComposeService } from './compose.service';
import { ComposeController } from './compose.controller';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [LlmModule],
  controllers: [ComposeController],
  providers: [ComposeService],
})
export class ComposeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cors()).forRoutes({ path: 'compose', method: RequestMethod.POST });
  }
}
