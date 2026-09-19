import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { BusinessesModule } from './businesses/businesses.module';
import { ProductsModule } from './products/products.module';
import { DiscountsModule } from './discounts/discounts.module';
import { PricingModule } from './pricing/pricing.module';
import { DealsModule } from './deals/deals.module';
import { SearchModule } from './search/search.module';
import { PhotosModule } from './photos/photos.module';
import { WeatherModule } from './weather/weather.module';
import { ClassifyModule } from './classify/classify.module';
import { ComposeModule } from './compose/compose.module';
import { TranscribeModule } from './transcribe/transcribe.module';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { VendorModule } from './vendor/vendor.module';
import { OwnerModule } from './owner/owner.module';
import { PublicModule } from './public/public.module';
import { RequestsModule } from './requests/requests.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { MailerModule } from './mailer/mailer.module';
import { SpaModule } from './spa/spa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    // Static client assets (client/dist) — SPA page routes are handled
    // separately by SpaModule/SpaController since ServeStaticModule can't
    // fall back to index.html for unmatched routes on its own.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'dist'),
      exclude: [
        '/search*',
        '/search/products*',
        '/deals*',
        '/classify*',
        '/compose*',
        '/transcribe*',
        '/places/*',
        '/submit-deal*',
        '/impressions*',
        '/search-gaps*',
        '/businesses*',
        '/products*',
        '/discounts*',
        '/requests*',
        '/professionals*',
        '/auth*',
        '/customer/*',
        '/vendor*',
        '/owner*',
      ],
    }),
    BusinessesModule,
    ProductsModule,
    DiscountsModule,
    PricingModule,
    DealsModule,
    SearchModule,
    PhotosModule,
    WeatherModule,
    ClassifyModule,
    ComposeModule,
    TranscribeModule,
    MailerModule,
    AccountsModule,
    AuthModule,
    CustomersModule,
    VendorModule,
    OwnerModule,
    PublicModule,
    RequestsModule,
    ProfessionalsModule,
    SpaModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
