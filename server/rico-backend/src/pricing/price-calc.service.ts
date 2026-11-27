import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Discount, DiscountDocument } from '../discounts/schemas/discount.schema';

/// How often discounts that started or ended on their own (by date, with no
/// write to trigger a recompute) get their product's finalPrice refreshed.
/// Orders don't wait for this — they recompute at checkout — it only keeps
/// the price the catalog *shows* from lagging by more than this.
const DISCOUNT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

@Injectable()
export class PriceCalcService implements OnModuleInit, OnModuleDestroy {
  private sweepTimer: NodeJS.Timeout | null = null;
  private lastSweepAt = new Date();

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Discount.name) private readonly discountModel: Model<DiscountDocument>,
    private readonly productsService: ProductsService,
  ) {}

  onModuleInit(): void {
    // A boot is a sweep with an unknown "since" — anything may have crossed
    // a date while the server was down — so the first pass looks back a day.
    this.lastSweepAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.sweepTimer = setInterval(() => {
      this.sweepDateBoundaries().catch((e) => console.error('[pricing] discount sweep failed:', e?.message || e));
    }, DISCOUNT_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  /// Never below zero and never above the list price: a 150% discount or a
  /// "fixed" price higher than the original is a typo, not an offer, and a
  /// negative price would make order totals negative.
  computeFinalPrice(price: number, discount: { type: string; value: number } | null): number {
    if (!discount) return price;
    const discounted = discount.type === 'percentage' ? price - (price * discount.value) / 100 : discount.value;
    return Math.min(price, Math.max(0, discounted));
  }

  // Called whenever a Discount is created/updated/expired — finds the
  // product's current best active discount (if any) and recomputes
  // finalPrice. Discounts that start or end by date alone are picked up by
  // the periodic sweep, and orders recompute their own lines at checkout.
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
    if (finalPrice !== product.finalPrice) {
      await this.productsService.setFinalPrice(productId, finalPrice);
    }
  }

  async recomputeForProducts(productIds: string[]): Promise<void> {
    for (const id of new Set(productIds)) await this.recomputeForProduct(id);
  }

  /// Products whose discount started or ended since the last sweep. Without
  /// this, a discount whose endDate passed kept the discounted price forever
  /// (nothing wrote to it again), and one with a future startDate never began.
  async sweepDateBoundaries(now = new Date()): Promise<number> {
    const since = this.lastSweepAt;
    const productIds: unknown[] = await this.discountModel.distinct('productId', {
      $or: [{ startDate: { $gt: since, $lte: now } }, { endDate: { $gt: since, $lte: now } }],
    });
    await this.recomputeForProducts(productIds.map(String));
    this.lastSweepAt = now;
    return productIds.length;
  }
}
