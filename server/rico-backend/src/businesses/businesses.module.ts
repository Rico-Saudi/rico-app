import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Business, BusinessSchema } from './schemas/business.schema';
import { BusinessImage, BusinessImageSchema } from './schemas/business-image.schema';
import { BusinessesService } from './businesses.service';
import { BusinessesController } from './businesses.controller';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [MongooseModule.forFeature([
      { name: Business.name, schema: BusinessSchema },
      { name: BusinessImage.name, schema: BusinessImageSchema },
    ]),
    AccountsModule],
  controllers: [BusinessesController],
  providers: [BusinessesService],
  exports: [MongooseModule, BusinessesService],
})
export class BusinessesModule {}
