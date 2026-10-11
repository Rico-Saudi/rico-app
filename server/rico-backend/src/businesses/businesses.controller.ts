import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { ListBusinessDto } from './dto/list-business.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  // Writes are owner-app only — Business rows are platform-owned master
  // data; vendors never edit them directly, only claim + manage their own
  // Product/Discount/Deal under one via /vendor/*.
  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Post()
  create(@Body() dto: CreateBusinessDto) {
    return this.businessesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListBusinessDto) {
    return this.businessesService.findAll(query);
  }

  // Public: a storefront photo has to render for shoppers in the chat, not
  // just for the vendor who uploaded it. Declared above @Get(':id') so
  // 'images' isn't swallowed as a business id. The URL carries the image's own
  // id and a replacement mints a new one, so the bytes behind it never change
  // and can be cached forever.
  @Get('images/:imageId')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async findImage(@Param('imageId') imageId: string, @Res({ passthrough: true }) res: Response) {
    const image = await this.businessesService.findImage(imageId);
    res.set({ 'Content-Type': image.contentType, 'Content-Length': String(image.size) });
    return new StreamableFile(image.data);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.businessesService.findOne(id);
  }

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBusinessDto) {
    return this.businessesService.update(id, dto);
  }

  @UseGuards(SessionGuard)
  @RequireApp('owner')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.businessesService.remove(id);
  }
}
