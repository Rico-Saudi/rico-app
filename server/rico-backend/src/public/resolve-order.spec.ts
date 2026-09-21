import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PublicService } from './public.service';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { VendorImpression, VendorImpressionDocument, VendorImpressionSchema } from './schemas/vendor-impression.schema';
import { SearchGap, SearchGapDocument, SearchGapSchema } from './schemas/search-gap.schema';
import { CatalogGap, CatalogGapDocument, CatalogGapSchema } from './schemas/catalog-gap.schema';
import { CustomerRequest, CustomerRequestDocument, CustomerRequestSchema } from '../requests/schemas/request.schema';

// End of the chain the chat actually walks: a shop name and some dish names in,
// a basket plus an honest list of misses out.
describe('PublicService.resolveOrder', () => {
  let mongod: MongoMemoryServer;
  let service: PublicService;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;
  let catalogGapModel: Model<CatalogGapDocument>;

  const deals = { findActiveForBusiness: jest.fn().mockResolvedValue([]) };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    businessModel = mongoose.model(Business.name, BusinessSchema) as unknown as Model<BusinessDocument>;
    productModel = mongoose.model(Product.name, ProductSchema) as unknown as Model<ProductDocument>;
    const impressionModel = mongoose.model(VendorImpression.name, VendorImpressionSchema) as unknown as Model<VendorImpressionDocument>;
    const gapModel = mongoose.model(SearchGap.name, SearchGapSchema) as unknown as Model<SearchGapDocument>;
    catalogGapModel = mongoose.model(CatalogGap.name, CatalogGapSchema) as unknown as Model<CatalogGapDocument>;
    const requestModel = mongoose.model(CustomerRequest.name, CustomerRequestSchema) as unknown as Model<CustomerRequestDocument>;

    service = new PublicService(businessModel, productModel, impressionModel, gapModel, catalogGapModel, requestModel, deals as any);
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await service.whenGapsWritten();
    await Promise.all([businessModel.deleteMany({}), productModel.deleteMany({}), catalogGapModel.deleteMany({})]);
    deals.findActiveForBusiness.mockResolvedValue([]);

    const shop = await businessModel.create({
      name: 'Maher Restaurant',
      nameAr: 'مطعم الماهر',
      categorySlug: 'restaurant',
      location: { type: 'Point', coordinates: [46.6753, 24.7136] },
    });
    // A second shop with an overlapping word, so name resolution has to choose.
    await businessModel.create({
      name: 'Maher Cafe',
      nameAr: 'كافيه الماهر',
      categorySlug: 'cafe',
      location: { type: 'Point', coordinates: [46.68, 24.71] },
    });

    for (const [name, price, image] of [
      ['كنافة نابلسية', 20, '/products/images/aaaaaaaaaaaaaaaaaaaaaaaa'],
      ['أرز بحليب', 11, null],
      ['شاورما دجاج صحن', 28, null],
      ['شاورما لحم عربي', 18, null],
      ['بطاطس مقلية', 10, null],
    ] as [string, number, string | null][]) {
      await productModel.create({
        businessId: shop._id, name, price, finalPrice: price, imageUrl: image,
      });
    }
  });

  const order = (placeName: string, items: { name: string; quantity?: number }[]) =>
    service.resolveOrder({ placeName, items });

  it('fills a basket from the exact phrasing in the example', async () => {
    const res = await order('مطعم الماهر', [{ name: 'كنافة نابلسية' }, { name: 'أرز بحليب' }]);

    expect(res.business?.name).toBe('مطعم الماهر');
    expect(res.unmatched).toEqual([]);
    expect(res.matched.map((m: any) => [m.label, m.quantity, m.unitPrice])).toEqual([
      ['كنافة نابلسية', 1, 20],
      ['أرز بحليب', 1, 11],
    ]);
    expect(res.matched[0].imageUrl).toBe('/products/images/aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('keeps the quantities the customer asked for', async () => {
    const res = await order('مطعم الماهر', [
      { name: 'كنافة', quantity: 3 },
      { name: 'بطاطس', quantity: 2 },
    ]);
    expect(res.matched.map((m: any) => [m.label, m.quantity])).toEqual([
      ['كنافة نابلسية', 3],
      ['بطاطس مقلية', 2],
    ]);
  });

  it('reports dishes the shop does not sell instead of guessing', async () => {
    const res = await order('مطعم الماهر', [
      { name: 'كنافة نابلسية' },
      { name: 'بيتزا' },
      { name: 'سوشي' },
    ]);
    expect(res.matched).toHaveLength(1);
    expect(res.unmatched).toEqual(['بيتزا', 'سوشي']);
    // The found item is still basketed — a miss doesn't discard the rest.
    expect(res.matched[0].label).toBe('كنافة نابلسية');
  });

  it('offers the closest dish instead of a bare "not found"', async () => {
    const res = await order('مطعم الماهر', [{ name: 'كنافة نابلسية' }, { name: 'بودنغ أرز' }]);

    // Still an honest miss: it is NOT silently basketed as أرز بحليب.
    expect(res.unmatched).toEqual(['بودنغ أرز']);
    expect(res.matched.map((m: any) => m.label)).toEqual(['كنافة نابلسية']);
    // ...but the row the customer almost named comes back as a question.
    expect(res.suggestions).toEqual([
      { requested: 'بودنغ أرز', itemType: 'product', itemId: expect.any(String), label: 'أرز بحليب' },
    ]);
  });

  it('stays quiet when nothing on the menu is close', async () => {
    const res = await order('مطعم الماهر', [{ name: 'سوشي' }]);

    expect(res.unmatched).toEqual(['سوشي']);
    // A 0.1-scoring "closest" row is noise, not a suggestion.
    expect(res.suggestions).toEqual([]);
  });

  it('records every miss against the shop as a demand signal', async () => {
    await order('مطعم الماهر', [{ name: 'بودنغ أرز' }, { name: 'سوشي' }]);
    // insertMany is fire-and-forget inside resolveOrder.
    await service.whenGapsWritten();

    const gaps = await catalogGapModel.find().sort({ requestedItem: 1 }).lean();
    expect(gaps.map((g: any) => g.requestedItem).sort()).toEqual(['بودنغ أرز', 'سوشي']);

    const near = gaps.find((g: any) => g.requestedItem === 'بودنغ أرز') as any;
    expect(near.nearestLabel).toBe('أرز بحليب');
    expect(near.nearestScore).toBeGreaterThan(0.35);

    // The shop has nothing like sushi, so the owner sees that plainly.
    const far = gaps.find((g: any) => g.requestedItem === 'سوشي') as any;
    expect(far.nearestScore).toBeLessThan(0.35);
  });

  it('records nothing when every item matched', async () => {
    await order('مطعم الماهر', [{ name: 'كنافة نابلسية' }]);
    await service.whenGapsWritten();
    expect(await catalogGapModel.countDocuments()).toBe(0);
  });

  it('picks the shop the customer named, not its namesake', async () => {
    expect((await order('مطعم الماهر', [{ name: 'كنافة' }])).business?.name).toBe('مطعم الماهر');
    expect((await order('كافيه الماهر', [{ name: 'كنافة' }])).business?.name).toBe('كافيه الماهر');
  });

  it('finds the shop through spelling differences', async () => {
    const res = await order('مطعم الماهر', [{ name: 'كنافه نابلسيه' }]);
    expect(res.business).not.toBeNull();
    expect(res.matched[0].label).toBe('كنافة نابلسية');
  });

  it('says the shop is unknown rather than listing every dish as missing', async () => {
    const res = await order('مطعم ما له وجود', [{ name: 'كنافة' }, { name: 'أرز بحليب' }]);
    expect(res.business).toBeNull();
    expect(res.catalog).toBeNull();
    expect(res.unmatched).toEqual(['كنافة', 'أرز بحليب']);
  });

  it('refuses a different shop that merely shares the word مطعم', async () => {
    // The dangerous failure: quietly basketing an order for the wrong shop.
    const res = await order('مطعم البيك', [{ name: 'كنافة نابلسية' }]);
    expect(res.business).toBeNull();
  });

  it('merges two phrasings of the same dish into one line', async () => {
    const res = await order('مطعم الماهر', [
      { name: 'كنافة', quantity: 1 },
      { name: 'كنافة نابلسية', quantity: 2 },
    ]);
    expect(res.matched).toHaveLength(1);
    expect(res.matched[0].quantity).toBe(3);
  });

  it('returns the menu when a shop is named with no dishes', async () => {
    const res = await order('مطعم الماهر', []);
    expect(res.business?.name).toBe('مطعم الماهر');
    expect(res.catalog!.products).toHaveLength(5);
    expect(res.matched).toEqual([]);
    expect(res.unmatched).toEqual([]);
  });

  it('matches a deal by its title too', async () => {
    deals.findActiveForBusiness.mockResolvedValue([
      { _id: new mongoose.Types.ObjectId(), titleAr: 'خصم ٢٥٪ على المشاوي', dealType: 'percent', value: 25 },
    ]);
    const res = await order('مطعم الماهر', [{ name: 'خصم على المشاوي' }]);
    expect(res.matched[0]).toMatchObject({ itemType: 'deal', unitPrice: null });
  });

  it('records what the customer said next to what it matched', async () => {
    const res = await order('مطعم الماهر', [{ name: 'كنافه' }]);
    expect(res.matched[0].requestedAs).toBe('كنافه');
    expect(res.matched[0].label).toBe('كنافة نابلسية');
  });
});
