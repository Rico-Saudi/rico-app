import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PublicService } from './public.service';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { VendorImpression, VendorImpressionDocument, VendorImpressionSchema } from './schemas/vendor-impression.schema';
import { SearchGap, SearchGapDocument, SearchGapSchema } from './schemas/search-gap.schema';
import { CatalogGap, CatalogGapDocument, CatalogGapSchema } from './schemas/catalog-gap.schema';
import { CustomerRequest, CustomerRequestDocument, CustomerRequestSchema } from '../requests/schemas/request.schema';

// "وصّلي من مطعم وجبتين شاورما" — the customer names a kind of shop and the
// dishes, never a shop. Rico does not choose for them: it offers the nearby
// shops, ordered by how much of the order each can actually serve, and the
// customer taps one. Choosing silently would hide that a nearer shop exists,
// or that another one has the whole order.
describe('PublicService.resolveOrder — no shop named', () => {
  let mongod: MongoMemoryServer;
  let service: PublicService;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;

  const deals = { findActiveForBusiness: jest.fn().mockResolvedValue([]) };

  // Riyadh, and three restaurants walking away from it.
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
    // $near needs the 2dsphere index, which mongoose only builds on demand.
    await businessModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([businessModel.deleteMany({}), productModel.deleteMany({})]);
  });

  const shop = async (nameAr: string, kmEast: number, dishes: string[], categorySlug = 'restaurant') => {
    const doc = await businessModel.create({
      name: nameAr,
      nameAr,
      categorySlug,
      isActive: true,
      location: at(kmEast),
    });
    for (const name of dishes) {
      await productModel.create({ businessId: doc._id, name, price: 15, finalPrice: 15 });
    }
    return doc;
  };

  const order = (items: { name: string; quantity?: number }[], categorySlug = 'restaurant') =>
    service.resolveOrder({ categorySlug, lat: HERE.lat, lng: HERE.lng, items });

  const names = (res: any) => res.shopOptions.map((o: any) => o.name);

  it('offers the shops instead of filling a basket', async () => {
    await shop('مطعم الشام', 1.5, ['شاورما دجاج', 'فلافل']);

    const res = await order([{ name: 'شاورما', quantity: 2 }]);

    expect(res.business).toBeNull();
    expect(res.catalog).toBeNull();
    expect(res.matched).toEqual([]);
    expect(res.shopOptions).toHaveLength(1);
    expect(res.shopOptions[0]).toMatchObject({ name: 'مطعم الشام', has: ['شاورما'], missing: [] });
    expect(res.shopOptions[0].distanceMeters).toBeGreaterThan(0);
  });

  it('puts the shop that has the dish above a nearer one that does not', async () => {
    await shop('مطعم البيتزا', 0.5, ['بيتزا مارغريتا', 'بيتزا خضار']);
    await shop('مطعم الشام', 1.5, ['شاورما دجاج', 'فلافل']);

    const res = await order([{ name: 'شاورما', quantity: 2 }]);

    expect(names(res)).toEqual(['مطعم الشام', 'مطعم البيتزا']);
    expect(res.shopOptions[1]).toMatchObject({ has: [], missing: ['شاورما'] });
  });

  it('keeps distance as the tie-breaker when both have it', async () => {
    await shop('مطعم قريب', 0.5, ['شاورما دجاج']);
    await shop('مطعم بعيد', 2, ['شاورما دجاج']);

    expect(names(await order([{ name: 'شاورما' }]))).toEqual(['مطعم قريب', 'مطعم بعيد']);
  });

  // Walking two more minutes for the whole order beats arriving at the
  // nearest place and finding half of it missing.
  it('ranks coverage above distance', async () => {
    await shop('مطعم الشاورما', 0.5, ['شاورما دجاج']);
    await shop('مطعم الكل', 1.5, ['شاورما دجاج', 'بطاطس مقلية']);

    const res = await order([{ name: 'شاورما' }, { name: 'بطاطس' }]);

    expect(names(res)).toEqual(['مطعم الكل', 'مطعم الشاورما']);
    expect(res.shopOptions[0]).toMatchObject({ has: ['شاورما', 'بطاطس'], missing: [] });
    expect(res.shopOptions[1]).toMatchObject({ has: ['شاورما'], missing: ['بطاطس'] });
  });

  it('stays inside the kind of shop that was asked for', async () => {
    await shop('كافيه الركن', 0.3, ['شاورما دجاج'], 'cafe');
    await shop('مطعم الشام', 2, ['شاورما دجاج']);

    expect(names(await order([{ name: 'شاورما' }]))).toEqual(['مطعم الشام']);
  });

  // Nobody nearby has it. The nearby restaurants are still a real next step,
  // and each one says plainly that it doesn't have the dish.
  it('still offers nearby shops when none has the dish', async () => {
    await shop('مطعم البيتزا', 0.5, ['بيتزا مارغريتا']);
    await shop('مطعم البرغر', 1.5, ['برغر لحم']);

    const res = await order([{ name: 'سوشي' }]);

    expect(names(res)).toEqual(['مطعم البيتزا', 'مطعم البرغر']);
    expect(res.shopOptions.every((o: any) => o.missing.includes('سوشي'))).toBe(true);
  });

  // "وصّلي من مطعم وجبة" — any restaurant can serve that, so there is
  // nothing to rank on and the nearest come first untouched.
  it('ranks on distance alone when the order is generic', async () => {
    await shop('مطعم قريب', 0.5, ['شاورما دجاج']);
    await shop('مطعم بعيد', 2, ['برغر لحم']);

    const res = await order([{ name: 'وجبة' }]);

    expect(names(res)).toEqual(['مطعم قريب', 'مطعم بعيد']);
    expect(res.shopOptions[0]).toMatchObject({ has: [], missing: [] });
  });

  it('answers honestly when there is no such shop nearby at all', async () => {
    await shop('صيدلية النهدي', 0.5, ['بنادول'], 'pharmacy');

    const res = await order([{ name: 'شاورما' }]);
    expect(res.shopOptions).toEqual([]);
    expect(res.business).toBeNull();
  });

  // The other half of the flow: the customer taps one of the offered shops
  // and the basket is filled from it, by id — never by name again.
  describe('after the customer picks one', () => {
    it('fills the basket from the shop they chose', async () => {
      const chosen = await shop('مطعم الشام', 1.5, ['شاورما دجاج']);
      await shop('مطعم البيتزا', 0.5, ['بيتزا مارغريتا']);

      const res = await service.resolveOrder({
        businessId: String(chosen._id),
        items: [{ name: 'شاورما', quantity: 2 }],
      });

      expect(res.business?.name).toBe('مطعم الشام');
      expect(res.matched.map((m: any) => [m.label, m.quantity])).toEqual([['شاورما دجاج', 2]]);
      expect(res.pickedFromOptions).toBe(true);
      expect(res.shopOptions).toEqual([]);
    });

    // Two shops can share a name; the id is the only thing that can't be
    // resolved to the wrong one.
    it('uses the id, not the name, when two shops share one', async () => {
      await shop('مطعم الشام', 0.5, ['فلافل']);
      const second = await shop('مطعم الشام', 2, ['شاورما دجاج']);

      const res = await service.resolveOrder({
        businessId: String(second._id),
        items: [{ name: 'شاورما' }],
      });

      expect(res.matched.map((m: any) => m.label)).toEqual(['شاورما دجاج']);
    });

    it('a shop the customer named itself is not "picked from options"', async () => {
      await shop('مطعم الشام', 0.5, ['شاورما دجاج']);
      const res = await service.resolveOrder({ placeName: 'مطعم الشام', items: [{ name: 'شاورما' }] });
      expect(res.pickedFromOptions).toBe(false);
    });
  });
});
