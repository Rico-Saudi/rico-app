import { Injectable } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Discount, DiscountDocument } from '../discounts/schemas/discount.schema';

@Injectable()
export class PriceCalcService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Discount.name) private readonly discountModel: Model<DiscountDocument>,
    private readonly productsService: ProductsService,
  ) {}

  computeFinalPrice(price: number, discount: { type: string; value: number } | null): number {
    if (!discount) return price;
    return discount.type === 'percentage' ? price - (price * discount.value) / 100 : discount.value;
  }

  // Called whenever a Discount is created/updated/expired — finds the
  // product's current best active discount (if any) and recomputes
  // finalPrice, at read/write time rather than via a scheduled job (the
  // simpler of the two viable approaches, and sufficient here since writes
  // are the only thing that can change discount state — there's no
  // date-only expiry to poll for beyond what create/update already covers).
  async recomputeForProduct(productId: string): Promise<void> {
    const product = await this.productModel.findById(productId).lean();
    if (!product) return;

    const now = new Date();
    const activeDiscount = await this.discountModel
      .findOne({
        productId,
        isActive: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gt: now } }] },
        ],
      })
      .sort({ createdAt: -1 })
      .lean();

    const finalPrice = this.computeFinalPrice(product.price, activeDiscount);
    await this.productsService.setFinalPrice(productId, finalPrice);
  }
}
