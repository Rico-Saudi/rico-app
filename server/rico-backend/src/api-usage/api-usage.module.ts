import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApiUsage, ApiUsageSchema } from '../owner/schemas/api-usage.schema';
import { ApiUsageService } from './api-usage.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: ApiUsage.name, schema: ApiUsageSchema }])],
  providers: [ApiUsageService],
  exports: [ApiUsageService],
})
export class ApiUsageModule {}
