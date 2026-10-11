import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { MAX_SHOPS, shopRegistry } from './fallback/shop-registry';
import { isGenericWord } from './fallback/keyword-classifier';

/** How often the registry is rebuilt. `SHOP_NAMES_REFRESH_MINUTES=0` reads
 * once at boot and never again. */
const DEFAULT_REFRESH_MINUTES = 15;
const MAX_PRODUCTS = 100_000;

/**
 * يعبّي سجل المحلات والأصناف (fallback/shop-registry.ts) من قاعدة البيانات.
 *
 * عشان «اطلب من مطعم تاج محل…» تنفهم حتى لو الاسم مش بالقاموس الثابت: كل
 * محل نشط عند ريكو — شريك أو مخزّن من Google — اسمه معروف للمصنّف الاحتياطي،
 * وأسماء الأصناف من المنيوهات تساعده يفصل اسم المحل عن السلة.
 */
@Injectable()
export class ShopNamesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShopNamesService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.refresh();
    } catch (error) {
      // An unreachable database must not stop the server: the classifier
      // then works from its fixed tables, as it did before this existed.
      this.logger.warn(`shop names not loaded, the fallback runs on its fixed tables: ${error}`);
    }
    const minutes = Number(process.env.SHOP_NAMES_REFRESH_MINUTES ?? DEFAULT_REFRESH_MINUTES);
    if (minutes > 0) {
      this.timer = setInterval(() => this.refresh().catch((e) => this.logger.warn(`shop names refresh failed: ${e}`)), minutes * 60_000);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async refresh(): Promise<void> {
    const withMenu = new Set((await this.productModel.distinct('businessId', { isActive: true })).map(String));
    const businesses = await this.businessModel
      .find({ isActive: true }, { name: 1, nameAr: 1, categorySlug: 1 })
      .limit(MAX_SHOPS)
      .lean();
    const products = await this.productModel.find({ isActive: true }, { name: 1 }).limit(MAX_PRODUCTS).lean();

    const shops = businesses.flatMap((b) => {
      const hasMenu = withMenu.has(String(b._id));
      const category = b.categorySlug ?? null;
      // Both names a shop goes by: "Al Baik" and "البيك" are one shop.
      return [b.name, b.nameAr].filter((n): n is string => !!n && !!n.trim()).map((name) => ({ name: name.trim(), category, hasMenu }));
    });

    shopRegistry.replaceAll(
      shops,
      products.map((p) => p.name),
      isGenericWord,
    );
    this.logger.log(`shop names loaded: ${shopRegistry.size} names from ${businesses.length} shops, ${products.length} products`);
  }
}
