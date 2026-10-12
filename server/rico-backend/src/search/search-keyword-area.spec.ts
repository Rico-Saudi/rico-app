import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SearchService } from './search.service';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';

// "مطعم مندي" and "صيدلية بالعليا" used to reach search as a bare category:
// every restaurant nearby, and every pharmacy around the customer rather
// than in the district they named.
describe('SearchService keyword and area', () => {
  let mongod: MongoMemoryServer;
  let service: SearchService;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;

  const RIYADH = { lat: 24.7136, lng: 46.6753 };
  // ~12km north: outside the default 3km radius, inside a named-area search.
  const NARJIS = { lat: 24.8216, lng: 46.6753 };
  const apiUsage = { tryConsume: async () => false };

  const seed = (name: string, at = RIYADH, extra: Record<string, unknown> = {}) =>
    businessModel.create({
      name,
      nameAr: name,
      categorySlug: 'restaurant',
      location: { type: 'Point', coordinates: [at.lng, at.lat] },
      enrichmentSource: 'manual',
      isActive: true,
      ...extra,
    });

  const names = async (dto: Record<string, unknown>) =>
    (
      await service.searchBusinesses({ lat: RIYADH.lat, lng: RIYADH.lng, radius: 3000, categorySlug: 'restaurant', ...dto } as any)
    ).places.map((p) => p.name);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    businessModel = mongoose.model(Business.name, BusinessSchema) as unknown as Model<BusinessDocument>;
    productModel = mongoose.model(Product.name, ProductSchema) as unknown as Model<ProductDocument>;
    await businessModel.createIndexes();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([businessModel.deleteMany({}), productModel.deleteMany({})]);
    service = new SearchService(businessModel, productModel, apiUsage as any, { upsertBySource: async () => ({}) } as any, {
      rememberPendingRef: () => {},
    } as any);
  });

  it('keeps only restaurants whose name or menu has the dish', async () => {
    await seed('مندي الريف');
    const burger = await seed('برجر هاوس');
    const kitchen = await seed('مطبخ الحارة');
    await productModel.create({ businessId: kitchen._id, name: 'نص حبة مندي لحم', price: 40, finalPrice: 40 });
    await productModel.create({ businessId: burger._id, name: 'برجر دبل', price: 25, finalPrice: 25 });

    expect((await names({ keyword: 'مندي' })).sort()).toEqual(['مطبخ الحارة', 'مندي الريف'].sort());
  });

  it('ignores a dish that only a removed menu item had', async () => {
    const shop = await seed('مطبخ قديم');
    await productModel.create({ businessId: shop._id, name: 'مندي', price: 40, finalPrice: 40, isActive: false });
    expect(await names({ keyword: 'مندي' })).toEqual([]);
  });

  it('finds the named district even outside the usual radius', async () => {
    await seed('مطعم النرجس', NARJIS, { district: 'حي النرجس' });
    await seed('مطعم قريب', RIYADH, { district: 'العليا' });
    expect(await names({ area: 'النرجس' })).toEqual(['مطعم النرجس']);
  });

  it('behaves as before with neither', async () => {
    await seed('مطعم قريب');
    expect(await names({})).toEqual(['مطعم قريب']);
  });
});
