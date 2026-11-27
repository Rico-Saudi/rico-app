import { Module } from '@nestjs/common';
import { ApiUsageModule } from '../api-usage/api-usage.module';
import { LlmService } from './llm.service';

@Module({
  imports: [ApiUsageModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
