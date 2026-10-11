import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsModule } from '../products/products.module';
import { Discount, DiscountSchema } from '../discounts/schemas/discount.schema';
import { PriceCalcService } from './price-calc.service';

@Module({
  imports: [ProductsModule, MongooseModule.forFeature([{ name: Discount.name, schema: DiscountSchema }])],
  providers: [PriceCalcService],
  exports: [PriceCalcService],
})
export class PricingModule {}
