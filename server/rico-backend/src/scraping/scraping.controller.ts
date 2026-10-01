import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ScrapingService } from './scraping.service';
import { CreateScrapeSourceDto } from './dto/create-scrape-source.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';

/// Owner-only, and manually triggered.
///
/// There is no schedule and no discovery crawl: every page Rico reads was
/// named by a person, and every run was started by one. That keeps the blast
/// radius of a mistake to a single page, and means nobody can wake up to find
/// the crawler has been working through a site all night.
@Controller('owner/scraping')
@UseGuards(SessionGuard)
@RequireApp('owner')
export class ScrapingController {
  constructor(private readonly scrapingService: ScrapingService) {}

  @Get('sources')
  list() {
    return this.scrapingService.listSources();
  }

  @Post('sources')
  add(@Body() dto: CreateScrapeSourceDto) {
    return this.scrapingService.addSource(dto);
  }

  @Patch('sources/:id')
  setEnabled(@Param('id') id: string, @Body('enabled') enabled: boolean) {
    return this.scrapingService.setEnabled(id, enabled);
  }

  @Delete('sources/:id')
  remove(@Param('id') id: string) {
    return this.scrapingService.removeSource(id);
  }

  @Post('sources/:id/run')
  run(@Param('id') id: string) {
    return this.scrapingService.runSource(id);
  }
}
