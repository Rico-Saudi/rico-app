import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Discount, DiscountSchema } from './schemas/discount.schema';
import { DiscountsService } from './discounts.service';
import { DiscountsController } from './discounts.controller';
import { PricingModule } from '../pricing/pricing.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Discount.name, schema: DiscountSchema }]), PricingModule, AccountsModule],
  controllers: [DiscountsController],
  providers: [DiscountsService],
  exports: [MongooseModule, DiscountsService],
})
export class DiscountsModule {}
