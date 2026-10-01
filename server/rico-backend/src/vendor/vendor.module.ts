import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessClaim, BusinessClaimSchema } from './schemas/business-claim.schema';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { DealsModule } from '../deals/deals.module';
import { ProductsModule } from '../products/products.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { RequestsModule } from '../requests/requests.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BusinessClaim.name, schema: BusinessClaimSchema }]),
    AccountsModule,
    BusinessesModule,
    DealsModule,
    ProductsModule,
    DiscountsModule,
    RequestsModule,
  ],
  controllers: [VendorController],
  providers: [VendorService],
  exports: [MongooseModule],
})
export class VendorModule {}
