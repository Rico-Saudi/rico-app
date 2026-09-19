import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductDto } from './dto/list-product.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListProductDto) {
    return this.productsService.findAll(query);
  }

  // Public: a product photo has to render for shoppers, not just for the vendor
  // who uploaded it. Declared above @Get(':id') so 'images' isn't swallowed as
  // a product id. The URL carries the image's own id and a replacement mints a
  // new one, so the bytes behind it never change and can be cached forever.
  @Get('images/:imageId')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async findImage(@Param('imageId') imageId: string, @Res({ passthrough: true }) res: Response) {
    const image = await this.productsService.findImage(imageId);
    res.set({ 'Content-Type': image.contentType, 'Content-Length': String(image.size) });
    return new StreamableFile(image.data);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
