import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PublicService } from './public.service';
import { isSameProduct } from './order-matching.util';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { VendorImpression, VendorImpressionDocument, VendorImpressionSchema } from './schemas/vendor-impression.schema';
import { SearchGap, SearchGapDocument, SearchGapSchema } from './schemas/search-gap.schema';
import { CatalogGap, CatalogGapDocument, CatalogGapSchema } from './schemas/catalog-gap.schema';
import { CustomerRequest, CustomerRequestDocument, CustomerRequestSchema } from '../requests/schemas/request.schema';

describe('isSameProduct', () => {
  it.each([
    ['جبنة', 'جبنة شيدر 500غ'],
    ['جبنة', 'جبنه بيضاء'],
    ['جبنة', 'الجبنة البيضاء'],
    ['جبنة', 'جبنة'],
    ['جبنه شيدار', 'جبنة شيدر'],
    ['جبنة شيدر', 'جبنة شيدر كرافت'],
    ['حليب', 'حليب طازج كامل الدسم ١ لتر'],
  ])('"%s" is "%s"', (query, name) => {
    expect(isSameProduct(query, name)).toBe(true);
  });

  it.each([
    // Mentions the product, but is something else.
    ['جبنة', 'فطيرة جبنة'],
    ['جبنة', 'خبز بالجبنة'],
    ['جبنة', 'كنافة بالجبنة'],
    ['حليب', 'أرز بحليب'],
    // Asked for a kind the row isn't.
    ['جبنة شيدر', 'جبنة بيضاء'],
  ])('"%s" is not "%s"', (query, name) => {
    expect(isSameProduct(query, name)).toBe(false);
  });

  it('reads past a brand written first', () => {
    expect(isSameProduct('جبنة', 'كرافت جبنة شيدر', 'كرافت')).toBe(true);
    expect(isSameProduct('جبنة', 'كرافت جبنة شيدر')).toBe(false);
  });
});

// "قارن لي وين أرخص جبنة" — the same product across the shops near the
// customer, cheapest first, one row per shop.
describe('PublicService.comparePrices', () => {
  let mongod: MongoMemoryServer;
  let service: PublicService;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;

  const deals = { findActiveForBusiness: jest.fn().mockResolvedValue([]) };

  const HERE = { lat: 24.7136, lng: 46.6753 };
  const at = (kmEast: number) => ({
    type: 'Point' as const,
    coordinates: [HERE.lng + kmEast / 101, HERE.lat],
  });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    businessModel = mongoose.model(Business.name, BusinessSchema) as unknown as Model<BusinessDocument>;
    productModel = mongoose.model(Product.name, ProductSchema) as unknown as Model<ProductDocument>;
    const impressionModel = mongoose.model(
      VendorImpression.name,
      VendorImpressionSchema,
    ) as unknown as Model<VendorImpressionDocument>;
    const gapModel = mongoose.model(SearchGap.name, SearchGapSchema) as unknown as Model<SearchGapDocument>;
    const catalogGapModel = mongoose.model(CatalogGap.name, CatalogGapSchema) as unknown as Model<CatalogGapDocument>;
    const requestModel = mongoose.model(CustomerRequest.name, CustomerRequestSchema) as unknown as Model<CustomerRequestDocument>;

    service = new PublicService(businessModel, productModel, impressionModel, gapModel, catalogGapModel, requestModel, deals as any);
    await businessModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([businessModel.deleteMany({}), productModel.deleteMany({})]);
  });

  const shop = async (
    nameAr: string,
    kmEast: number,
    products: { name: string; price: number; finalPrice?: number; unit?: string; inStock?: boolean; brand?: string }[],
    extra: Record<string, unknown> = {},
  ) => {
    const doc = await businessModel.create({
      name: nameAr,
      nameAr,
      categorySlug: 'supermarket',
      isActive: true,
      location: at(kmEast),
      ...extra,
    });
    for (const p of products) {
      await productModel.create({ businessId: doc._id, finalPrice: p.price, ...p });
    }
    return doc;
  };

  const compare = (names: string[], categorySlug?: string) =>
    service.comparePrices({ items: names.map((name) => ({ name })), lat: HERE.lat, lng: HERE.lng, categorySlug });

  const shopsIn = (res: { comparisons: any[] }, i = 0) => res.comparisons[i].offers.map((o: any) => o.businessName);

  it('ranks the shops by price, cheapest first, not by distance', async () => {
    await shop('بقالة قريبة', 0.3, [{ name: 'جبنة بيضاء', price: 14 }]);
    await shop('سوبرماركت بعيد', 4, [{ name: 'جبنه بيضاء', price: 9 }]);
    await shop('ماركت الوسط', 2, [{ name: 'الجبنة البيضاء', price: 11 }]);

    const res = await compare(['جبنة']);

    expect(shopsIn(res)).toEqual(['سوبرماركت بعيد', 'ماركت الوسط', 'بقالة قريبة']);
    expect(res.comparisons[0].requested).toBe('جبنة');
    expect(res.comparisons[0].offers[0]).toMatchObject({ productName: 'جبنه بيضاء', finalPrice: 9 });
    expect(res.comparisons[0].offers[0].distanceMeters).toBeGreaterThan(3000);
  });

  it("uses the price after discount, and each shop's cheapest cheese", async () => {
    await shop('بقالة النور', 1, [
      { name: 'جبنة شيدر', price: 20, finalPrice: 20 },
      { name: 'جبنة مثلثات', price: 12, finalPrice: 7, unit: 'علبة' },
    ]);
    await shop('بقالة الريم', 1, [{ name: 'جبنة بيضاء', price: 8 }]);

    const res = await compare(['جبنة']);

    expect(res.comparisons[0].offers).toHaveLength(2);
    expect(res.comparisons[0].offers[0]).toMatchObject({
      businessName: 'بقالة النور',
      productName: 'جبنة مثلثات',
      price: 12,
      finalPrice: 7,
      unit: 'علبة',
    });
  });

  it('leaves out rows that only mention the product, sold-out rows and paused shops', async () => {
    await shop('مخبز الحي', 0.5, [{ name: 'فطيرة جبنة', price: 3 }, { name: 'خبز بالجبنة', price: 2 }]);
    await shop('بقالة خلصت', 0.6, [{ name: 'جبنة بيضاء', price: 5, inStock: false }]);
    await shop('بقالة مسكّرة', 0.7, [{ name: 'جبنة بيضاء', price: 4 }], { ordersPaused: true });
    await shop('بقالة شغّالة', 3, [{ name: 'جبنة بيضاء', price: 10 }]);

    const res = await compare(['جبنة']);

    expect(shopsIn(res)).toEqual(['بقالة شغّالة']);
  });

  it('ignores shops beyond the comparison radius', async () => {
    await shop('بقالة بمدينة ثانية', 25, [{ name: 'جبنة', price: 1 }]);

    const res = await compare(['جبنة']);

    expect(res.comparisons[0].offers).toEqual([]);
  });

  it('compares each product on its own, and the same product named twice once', async () => {
    await shop('بقالة النور', 1, [{ name: 'حليب طازج', price: 6 }, { name: 'جبنة', price: 10 }]);
    await shop('بقالة الريم', 2, [{ name: 'حليب طازج', price: 5 }, { name: 'جبنة', price: 12 }]);

    const res = await compare(['جبنة', 'حليب', 'الجبنة']);

    expect(res.comparisons.map((c) => c.requested)).toEqual(['جبنة', 'حليب']);
    expect(shopsIn(res, 0)).toEqual(['بقالة النور', 'بقالة الريم']);
    expect(shopsIn(res, 1)).toEqual(['بقالة الريم', 'بقالة النور']);
  });

  it('keeps to one kind of shop when the customer named it', async () => {
    await shop('بقالة النور', 1, [{ name: 'جبنة', price: 10 }]);
    await shop('مخبز الحي', 1, [{ name: 'جبنة', price: 6 }], { categorySlug: 'bakery' });

    expect(shopsIn(await compare(['جبنة']))).toEqual(['مخبز الحي', 'بقالة النور']);
    expect(shopsIn(await compare(['جبنة'], 'supermarket'))).toEqual(['بقالة النور']);
  });
});
