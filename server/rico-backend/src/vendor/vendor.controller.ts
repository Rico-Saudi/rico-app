import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VendorService } from './vendor.service';
import { ClaimBusinessDto } from './dto/claim-business.dto';
import { CreateOwnDealDto } from './dto/create-own-deal.dto';
import { UpdateOwnDealDto } from './dto/update-own-deal.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';
import { AccountId } from '../common/decorators/account-id.decorator';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { UpdateProductDto } from '../products/dto/update-product.dto';
import { MAX_PRODUCT_IMAGE_BYTES } from '../products/constants/product-image.constants';
import { CreateDiscountDto } from '../discounts/dto/create-discount.dto';
import { UpdateDiscountDto } from '../discounts/dto/update-discount.dto';

@Controller('vendor')
@UseGuards(SessionGuard)
@RequireApp('vendor')
export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  @Get('me')
  me(@AccountId() accountId: string) {
    return this.vendorService.me(accountId);
  }

  @Post('claim-place')
  claimPlace(@AccountId() accountId: string, @Body() dto: ClaimBusinessDto) {
    return this.vendorService.claimBusiness(accountId, dto.businessId);
  }

  @Get('deals')
  listDeals(@AccountId() accountId: string) {
    return this.vendorService.listOwnDeals(accountId);
  }

  @Post('deals')
  createDeal(@AccountId() accountId: string, @Body() dto: CreateOwnDealDto) {
    return this.vendorService.createOwnDeal(accountId, dto);
  }

  @Patch('deals/:id')
  updateDeal(@AccountId() accountId: string, @Param('id') dealId: string, @Body() dto: UpdateOwnDealDto) {
    return this.vendorService.updateOwnDeal(accountId, dealId, dto);
  }

  @Get('products')
  listProducts(@AccountId() accountId: string, @Query('businessId') businessId: string) {
    return this.vendorService.listOwnProducts(accountId, businessId);
  }

  @Post('products')
  createProduct(@AccountId() accountId: string, @Body() dto: CreateProductDto) {
    return this.vendorService.createOwnProduct(accountId, dto);
  }

  @Patch('products/:id')
  updateProduct(@AccountId() accountId: string, @Param('id') productId: string, @Body() dto: UpdateProductDto) {
    return this.vendorService.updateOwnProduct(accountId, productId, dto);
  }

  @Delete('products/:id')
  removeProduct(@AccountId() accountId: string, @Param('id') productId: string) {
    return this.vendorService.removeOwnProduct(accountId, productId);
  }

  // Multipart rather than JSON, so the photo is uploaded as its own step after
  // the product itself is saved. Multer keeps it in memory — nothing is written
  // to Render's ephemeral disk — and the cap is enforced here so an oversized
  // file is refused before it's buffered, not after.
  @Post('products/:id/image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 1 } }))
  uploadProductImage(
    @AccountId() accountId: string,
    @Param('id') productId: string,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.vendorService.setOwnProductImage(accountId, productId, image);
  }

  @Delete('products/:id/image')
  removeProductImage(@AccountId() accountId: string, @Param('id') productId: string) {
    return this.vendorService.removeOwnProductImage(accountId, productId);
  }

  @Get('discounts')
  listDiscounts(@AccountId() accountId: string, @Query('productId') productId: string) {
    return this.vendorService.listOwnDiscounts(accountId, productId);
  }

  @Post('discounts')
  createDiscount(@AccountId() accountId: string, @Body() dto: CreateDiscountDto) {
    return this.vendorService.createOwnDiscount(accountId, dto);
  }

  @Patch('discounts/:id')
  updateDiscount(@AccountId() accountId: string, @Param('id') discountId: string, @Body() dto: UpdateDiscountDto) {
    return this.vendorService.updateOwnDiscount(accountId, discountId, dto);
  }

  @Patch('discounts/:id/expire')
  expireDiscount(@AccountId() accountId: string, @Param('id') discountId: string) {
    return this.vendorService.expireOwnDiscount(accountId, discountId);
  }

  @Get('requests')
  listRequests(@AccountId() accountId: string) {
    return this.vendorService.listOwnRequests(accountId);
  }

  @Patch('requests/:id/handled')
  markRequestHandled(@AccountId() accountId: string, @Param('id') requestId: string) {
    return this.vendorService.markOwnRequestHandled(accountId, requestId);
  }
}
