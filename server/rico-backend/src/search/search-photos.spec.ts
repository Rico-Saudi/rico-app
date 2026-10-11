import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SearchService } from './search.service';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';

// Which photo a result carries is a four-way fallback spread across two
// collections and an external API, and getting the order wrong is invisible
// until a partner complains their shop shows a stock glyph. So it's pinned
// here against a real (in-memory) Mongo.
describe('SearchService photo resolution', () => {
  let mongod: MongoMemoryServer;
  let service: SearchService;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;

  const RIYADH = { lat: 24.7136, lng: 46.6753 };

  // Reports the Google budget as exhausted so the fallback bails out
  // immediately — these tests are about our own data, not about Google.
  const apiUsage = { getUsage: async () => ({ period: '2026-09', count: 999 }), increment: async () => {} };
  const businesses = { upsertBySource: async () => ({}) };
  const photos = { rememberPendingRef: () => {} };

  const seedBusiness = (overrides: Record<string, unknown> = {}) =>
    businessModel.create({
      name: 'Cheap Eats',
      nameAr: 'ركن الأكل',
      categorySlug: 'restaurant',
      location: { type: 'Point', coordinates: [RIYADH.lng, RIYADH.lat] },
      enrichmentSource: 'manual',
      isActive: true,
      ...overrides,
    });

  const search = () =>
    service.searchBusinesses({ lat: RIYADH.lat, lng: RIYADH.lng, radius: 3000, categorySlug: 'restaurant' } as any);

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
    service = new SearchService(businessModel, productModel, apiUsage as any, businesses as any, photos as any);
  });

  it('shows nothing when a manually onboarded vendor has no photo anywhere', async () => {
    // The original complaint: a real partner rendering as a category glyph.
    await seedBusiness();
    const { places } = await search();

    expect(places).toHaveLength(1);
    expect(places[0].source).toBe('rico');
    expect(places[0].photoUrl).toBeNull();
  });

  it("prefers the vendor's own storefront photo over Google's", async () => {
    await seedBusiness({
      imageUrl: '/businesses/images/aaaaaaaaaaaaaaaaaaaaaaaa',
      photoRef: 'places/X/photos/Y',
      photoAttribution: 'Some Visitor',
      photoRefUpdatedAt: new Date(),
    });
    const { places } = await search();

    expect(places[0].photoUrl).toBe('/businesses/images/aaaaaaaaaaaaaaaaaaaaaaaa');
    // No credit line: the vendor took it, crediting a Google user would be wrong.
    expect(places[0].photoAttribution).toBeNull();
  });

  it("falls back to Google's photo when the vendor uploaded none", async () => {
    const business = await seedBusiness({
      photoRef: 'places/X/photos/Y',
      photoAttribution: 'Some Visitor',
      photoRefUpdatedAt: new Date(),
    });
    const { places } = await search();

    expect(places[0].photoUrl).toBe(`/places/${business._id}/photo`);
    expect(places[0].photoAttribution).toBe('Some Visitor');
  });

  it('falls back to a product photo when there is no storefront or Google photo', async () => {
    const business = await seedBusiness();
    await productModel.create({
      businessId: business._id,
      name: 'تمر سكري',
      price: 25,
      finalPrice: 25,
      imageUrl: '/products/images/bbbbbbbbbbbbbbbbbbbbbbbb',
      isActive: true,
    });

    const { places } = await search();
    expect(places[0].photoUrl).toBe('/products/images/bbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('ignores products that have no photo of their own', async () => {
    const business = await seedBusiness();
    await productModel.create({ businessId: business._id, name: 'شاي', price: 5, finalPrice: 5, isActive: true });

    const { places } = await search();
    expect(places[0].photoUrl).toBeNull();
  });

  it('never lets a product photo override a real one', async () => {
    const business = await seedBusiness({ imageUrl: '/businesses/images/aaaaaaaaaaaaaaaaaaaaaaaa' });
    await productModel.create({
      businessId: business._id,
      name: 'تمر سكري',
      price: 25,
      finalPrice: 25,
      imageUrl: '/products/images/bbbbbbbbbbbbbbbbbbbbbbbb',
      isActive: true,
    });

    const { places } = await search();
    expect(places[0].photoUrl).toBe('/businesses/images/aaaaaaaaaaaaaaaaaaaaaaaa');
  });
});
