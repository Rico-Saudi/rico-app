import { Controller, Get, Query } from '@nestjs/common';
import { DealsService } from './deals.service';
import { SearchDealsDto } from './dto/search-deals.dto';

@Controller()
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  // GET /deals?lat&lng&radius&now — response shape is Flutter-contract-critical.
  @Get('deals')
  findNearby(@Query() query: SearchDealsDto) {
    const now = query.now !== undefined ? new Date(query.now) : new Date();
    return this.dealsService.findNearby(query.lat, query.lng, query.radius ?? 3000, now);
  }
}
