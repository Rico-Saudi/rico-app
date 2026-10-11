import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScrapeSource, ScrapeSourceSchema } from './schemas/scrape-source.schema';
import { ScrapingService } from './scraping.service';
import { ScrapingController } from './scraping.controller';
import { DealsModule } from '../deals/deals.module';
import { BusinessesModule } from '../businesses/businesses.module';
import { ApiUsageModule } from '../api-usage/api-usage.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ScrapeSource.name, schema: ScrapeSourceSchema }]),
    DealsModule,
    BusinessesModule,
    ApiUsageModule,
    AccountsModule,
  ],
  controllers: [ScrapingController],
  providers: [ScrapingService],
})
export class ScrapingModule {}
