import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchBusinessDto } from './dto/search-business.dto';
import { SearchProductsDto } from './dto/search-products.dto';

@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // Flutter-contract-critical — response shape must stay byte-identical.
  @Get('search')
  searchBusinesses(@Query() query: SearchBusinessDto) {
    return this.searchService.searchBusinesses(query);
  }

  // New — rule-based product-catalog search (local-discovery-platform plan).
  @Get('search/products')
  searchProducts(@Query() query: SearchProductsDto) {
    return this.searchService.searchProducts(query.q, query.businessId);
  }
}
