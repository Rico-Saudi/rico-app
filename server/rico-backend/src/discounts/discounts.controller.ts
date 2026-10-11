import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';

@Controller('discounts')
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Post()
  create(@Body() dto: CreateDiscountDto) {
    return this.discountsService.create(dto);
  }

  @Get()
  findAll(@Query('productId') productId?: string) {
    return this.discountsService.findAll(productId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.discountsService.findOne(id);
  }

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDiscountDto) {
    return this.discountsService.update(id, dto);
  }

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Patch(':id/expire')
  expire(@Param('id') id: string) {
    return this.discountsService.expire(id);
  }
}
