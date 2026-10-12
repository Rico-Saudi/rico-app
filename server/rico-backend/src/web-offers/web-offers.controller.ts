import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { WebOffersService } from './web-offers.service';
import { WebDealsDto, WebPricesDto } from './dto/web-offers.dto';

// Offers and prices from the open web, beside the ones shops publish on Rico.
// Called by the app next to /deals and /orders/compare, never instead of
// them — so a slow or capped web lookup costs only its own section.
@Controller('web-offers')
export class WebOffersController {
  constructor(private readonly webOffers: WebOffersService) {}

  @Post('deals')
  @HttpCode(HttpStatus.OK)
  deals(@Body() dto: WebDealsDto) {
    return this.webOffers.findDeals(dto);
  }

  @Post('prices')
  @HttpCode(HttpStatus.OK)
  prices(@Body() dto: WebPricesDto) {
    return this.webOffers.findPrices(dto);
  }
}
