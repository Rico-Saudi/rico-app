import mongoose, { Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PublicService } from './public.service';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { VendorImpression, VendorImpressionDocument, VendorImpressionSchema } from './schemas/vendor-impression.schema';
import { SearchGap, SearchGapDocument, SearchGapSchema } from './schemas/search-gap.schema';
import { CatalogGap, CatalogGapDocument, CatalogGapSchema } from './schemas/catalog-gap.schema';
import { CustomerRequest, CustomerRequestDocument, CustomerRequestSchema } from '../requests/schemas/request.schema';

// "بدي وصي من مطعم الماهر وجبة" — the shop is named, the dish is not. Rico
// has to open the menu and choose, and every branch of that choice is here.
describe('PublicService.resolveOrder — choosing the dish', () => {
  let mongod: MongoMemoryServer;
  let service: PublicService;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;
  let requestModel: Model<CustomerRequestDocument>;
  let shopId: Types.ObjectId;

  const deals = { findActiveForBusiness: jest.fn().mockResolvedValue([]) };

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
    requestModel = mongoose.model(
      CustomerRequest.name,
      CustomerRequestSchema,
    ) as unknown as Model<CustomerRequestDocument>;

    service = new PublicService(
      businessModel,
      productModel,
      impressionModel,
      gapModel,
      catalogGapModel,
      requestModel,
      deals as any,
    );
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([businessModel.deleteMany({}), productModel.deleteMany({}), requestModel.deleteMany({})]);
    deals.findActiveForBusiness.mockResolvedValue([]);
    const shop = await businessModel.create({
      name: 'Maher Restaurant',
      nameAr: 'مطعم الماهر',
      categorySlug: 'restaurant',
      location: { type: 'Point', coordinates: [46.6753, 24.7136] },
    });
    shopId = shop._id as Types.ObjectId;
  });

  const dish = (name: string, price: number, finalPrice = price) =>
    productModel.create({ businessId: shopId, name, price, finalPrice });

  const order = (name: string, quantity?: number) =>
    service.resolveOrder({ placeName: 'مطعم الماهر', items: [{ name, quantity }] });

  /** A past lead for one dish — the evidence the 'popular' rule reads. */
  const pastRequest = async (businessId: Types.ObjectId, dishName: string) => {
    const product = await productModel.findOne({ name: dishName }).lean();
    await requestModel.create({
      businessId,
      customerName: 'عميل',
      customerPhone: '0500000000',
      items: [{ itemType: 'product', itemId: product!._id, label: dishName, quantity: 1, unitPrice: product!.finalPrice }],
      total: product!.finalPrice,
    });
  };

  // The headline case: a real shop, a real menu, and a customer who didn't
  // name a dish. Before this, it answered "ما لقيت وجبة عندهم".
  it('picks a dish and fills the basket', async () => {
    await dish('شاورما دجاج', 25);

    const res = await order('وجبة');

    expect(res.business?.name).toBe('مطعم الماهر');
    expect(res.unmatched).toEqual([]);
    expect(res.matched).toHaveLength(1);
    expect(res.matched[0]).toMatchObject({
      label: 'شاورما دجاج',
      quantity: 1,
      unitPrice: 25,
      requestedAs: 'وجبة',
      pickedBy: 'pick',
    });
  });

  it('keeps the quantity — "وجبتين" is two of whatever it picks', async () => {
    await dish('شاورما دجاج', 25);
    const res = await order('وجبة', 2);
    expect(res.matched[0].quantity).toBe(2);
  });

  describe('what it picks', () => {
    beforeEach(async () => {
      await dish('برغر عادي', 30);
      await dish('شاورما دجاج', 25, 18); // discounted
      await dish('بطاطس', 8);
    });

    it('prefers what other customers actually asked this shop for', async () => {
      await pastRequest(shopId, 'برغر عادي');

      const res = await order('وجبة');
      expect(res.matched[0]).toMatchObject({ label: 'برغر عادي', pickedBy: 'popular' });
    });

    // No history yet — the shop's own best value is the next most defensible
    // thing to hand someone who said "anything".
    it('falls back to a discounted dish', async () => {
      const res = await order('وجبة');
      expect(res.matched[0]).toMatchObject({ label: 'شاورما دجاج', pickedBy: 'deal' });
    });

    it('honours a stated budget over everything else', async () => {
      await pastRequest(shopId, 'برغر عادي');

      const res = await order('أرخص وجبة');
      expect(res.matched[0]).toMatchObject({ label: 'بطاطس', pickedBy: 'cheapest' });
    });

    it('counts popularity for this shop only', async () => {
      const other = await businessModel.create({
        name: 'Other',
        nameAr: 'مطعم ثاني',
        categorySlug: 'restaurant',
        location: { type: 'Point', coordinates: [46.68, 24.71] },
      });
      // A request placed at a different shop must not steer this shop's pick.
      await pastRequest(other._id as Types.ObjectId, 'بطاطس');

      const res = await order('وجبة');
      expect(res.matched[0].pickedBy).toBe('deal');
    });
  });

  // A menu row actually called "وجبة عائلية" is a dish, and naming it must
  // beat the hand-over reading — the normal matcher runs first for this.
  it('serves a real menu row named like the generic word', async () => {
    await dish('وجبة عائلية', 90);
    await dish('بطاطس', 8);

    const res = await order('وجبة عائلية');
    expect(res.matched[0].label).toBe('وجبة عائلية');
    expect(res.matched[0].pickedBy).toBeUndefined();
  });

  it('matches a bare "وجبة" to a menu row that has the word, rather than picking', async () => {
    await dish('وجبة عائلية', 90);

    const res = await order('وجبة');
    expect(res.matched[0].label).toBe('وجبة عائلية');
    expect(res.matched[0].pickedBy).toBeUndefined();
  });

  it('reports honestly when the shop has no menu at all', async () => {
    const res = await order('وجبة');
    expect(res.matched).toEqual([]);
    expect(res.unmatched).toEqual(['وجبة']);
  });

  it('mixes a named dish and a picked one without picking the same row twice', async () => {
    await dish('شاورما دجاج', 25);
    await dish('بطاطس', 8);

    const res = await service.resolveOrder({
      placeName: 'مطعم الماهر',
      items: [{ name: 'شاورما' }, { name: 'وجبة' }],
    });

    expect(res.unmatched).toEqual([]);
    expect(res.matched.map((m: any) => m.label)).toEqual(['شاورما دجاج', 'بطاطس']);
    expect(res.matched[1].pickedBy).toBe('pick');
  });

  it('gives two hand-overs two different dishes', async () => {
    await dish('شاورما دجاج', 25);
    await dish('بطاطس', 8);

    const res = await service.resolveOrder({
      placeName: 'مطعم الماهر',
      items: [{ name: 'وجبة' }, { name: 'أكلة' }],
    });

    const labels = res.matched.map((m: any) => m.label);
    expect(new Set(labels).size).toBe(2);
  });

  // One dish left, two hand-overs: the second has nothing to take and says so
  // rather than duplicating the first.
  it('stops picking when the menu runs out', async () => {
    await dish('شاورما دجاج', 25);

    const res = await service.resolveOrder({
      placeName: 'مطعم الماهر',
      items: [{ name: 'وجبة' }, { name: 'أكلة' }],
    });

    expect(res.matched).toHaveLength(1);
    expect(res.unmatched).toEqual(['أكلة']);
  });

  it('never picks for a dish the customer actually named', async () => {
    await dish('شاورما دجاج', 25);

    const res = await order('سوشي');
    expect(res.matched).toEqual([]);
    expect(res.unmatched).toEqual(['سوشي']);
  });
});

// "بدي من مطعم الماهر سوشي" — the shop is real, the dish isn't on its menu.
// The answer is the shop's actual menu plus the nearest thing on it, never a
// bare "ما لقيت" that leaves the customer where they started.
describe('PublicService.resolveOrder — named shop, dish not on the menu', () => {
  let mongod: MongoMemoryServer;
  let service: PublicService;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;
  let catalogGapModel: Model<CatalogGapDocument>;
  let shopId: Types.ObjectId;

  const deals = { findActiveForBusiness: jest.fn().mockResolvedValue([]) };

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
    catalogGapModel = mongoose.model(CatalogGap.name, CatalogGapSchema) as unknown as Model<CatalogGapDocument>;
    const requestModel = mongoose.model(
      CustomerRequest.name,
      CustomerRequestSchema,
    ) as unknown as Model<CustomerRequestDocument>;

    service = new PublicService(
      businessModel,
      productModel,
      impressionModel,
      gapModel,
      catalogGapModel,
      requestModel,
      deals as any,
    );
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await service.whenGapsWritten();
    await Promise.all([businessModel.deleteMany({}), productModel.deleteMany({}), catalogGapModel.deleteMany({})]);
    const shop = await businessModel.create({
      name: 'Maher Restaurant',
      nameAr: 'مطعم الماهر',
      categorySlug: 'restaurant',
      location: { type: 'Point', coordinates: [46.6753, 24.7136] },
    });
    shopId = shop._id as Types.ObjectId;
    for (const [name, price] of [
      ['أرز بحليب', 11],
      ['كنافة نابلسية', 20],
      ['شاورما دجاج', 25],
    ] as [string, number][]) {
      await productModel.create({ businessId: shopId, name, price, finalPrice: price });
    }
  });

  const order = (items: string[]) =>
    service.resolveOrder({ placeName: 'مطعم الماهر', items: items.map((name) => ({ name })) });

  // The whole menu comes back even though nothing matched — that is what the
  // client opens the shop with.
  it('returns the full menu so the shop can be opened and browsed', async () => {
    const res = await order(['سوشي']);

    expect(res.business?.name).toBe('مطعم الماهر');
    expect(res.matched).toEqual([]);
    expect(res.unmatched).toEqual(['سوشي']);
    expect(res.catalog?.products.map((p: any) => p.name)).toEqual(['أرز بحليب', 'كنافة نابلسية', 'شاورما دجاج']);
  });

  it('offers the nearest thing on the menu as a question', async () => {
    const res = await order(['بودنغ أرز']);

    expect(res.matched).toEqual([]);
    expect(res.unmatched).toEqual(['بودنغ أرز']);
    expect(res.suggestions).toEqual([
      expect.objectContaining({ requested: 'بودنغ أرز', label: 'أرز بحليب', itemType: 'product' }),
    ]);
  });

  // Silence beats a bad guess: nothing on this menu is remotely sushi, and
  // offering the closest row anyway would be noise.
  it('stays quiet when nothing on the menu is close', async () => {
    const res = await order(['سوشي']);
    expect(res.suggestions).toEqual([]);
    expect(res.catalog).not.toBeNull();
  });

  it('keeps what it found and reports the rest, with the menu still open', async () => {
    const res = await order(['كنافة', 'سوشي']);

    expect(res.matched.map((m: any) => m.label)).toEqual(['كنافة نابلسية']);
    expect(res.unmatched).toEqual(['سوشي']);
    expect(res.catalog?.products).toHaveLength(3);
  });

  // A dish the menu doesn't have is a demand signal for the shop owner, not
  // just an error shown once and thrown away.
  it('records the miss for the shop owner, with the nearest row it had', async () => {
    await order(['بودنغ أرز']);
    await service.whenGapsWritten();

    const gaps = await catalogGapModel.find({ businessId: shopId }).lean();
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ requestedItem: 'بودنغ أرز', nearestLabel: 'أرز بحليب' });
  });
});
