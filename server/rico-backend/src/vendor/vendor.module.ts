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
import { PricingModule } from '../pricing/pricing.module';
import { VendorImpression, VendorImpressionSchema } from '../public/schemas/vendor-impression.schema';
import { CatalogGap, CatalogGapSchema } from '../public/schemas/catalog-gap.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BusinessClaim.name, schema: BusinessClaimSchema },
      // Read-only here, for the vendor's own stats. PublicModule writes them.
      { name: VendorImpression.name, schema: VendorImpressionSchema },
      { name: CatalogGap.name, schema: CatalogGapSchema },
    ]),
    AccountsModule,
    BusinessesModule,
    DealsModule,
    ProductsModule,
    DiscountsModule,
    RequestsModule,
    PricingModule,
  ],
  controllers: [VendorController],
  providers: [VendorService],
  exports: [MongooseModule],
})
export class VendorModule {}
