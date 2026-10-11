import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { PublicService } from './public.service';
import { SearchPlacesDto } from './dto/search-places.dto';
import { SubmitDealDto } from './dto/submit-deal.dto';
import { TrackImpressionsDto } from './dto/track-impressions.dto';
import { TrackSearchGapDto } from './dto/track-search-gap.dto';
import { ResolveOrderDto } from './dto/resolve-order.dto';

@Controller()
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('places/search')
  searchPlaces(@Query() query: SearchPlacesDto) {
    return this.publicService.searchPlaces(query.q);
  }

  @Get('places/:id/catalog')
  getCatalog(@Param('id') id: string) {
    return this.publicService.getCatalog(id);
  }

  // Turns a spoken order into a basket: resolves the shop by name, matches
  // each dish against its real catalogue, and says plainly which ones it
  // couldn't find. Public, like the catalogue itself — placing the order still
  // needs an account (POST /requests), this only fills the basket.
  @Post('orders/resolve')
  @HttpCode(HttpStatus.OK)
  resolveOrder(@Body() dto: ResolveOrderDto) {
    return this.publicService.resolveOrder(dto);
  }

  @Post('submit-deal')
  submitDeal(@Body() dto: SubmitDealDto) {
    return this.publicService.submitDeal(dto);
  }

  @Post('impressions')
  trackImpressions(@Body() dto: TrackImpressionsDto) {
    return this.publicService.trackImpressions(dto.items);
  }

  @Post('search-gaps')
  trackSearchGap(@Body() dto: TrackSearchGapDto) {
    return this.publicService.trackSearchGap(dto);
  }
}
