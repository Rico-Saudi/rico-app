import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ForbiddenException, ConflictException, ValidationPipe } from '@nestjs/common';
import { BulkProductsDto } from './dto/bulk-products.dto';
import { VendorService, sanitizeAttributes } from './vendor.service';
import { verticalFor } from './constants/verticals';
import { Account, AccountDocument, AccountSchema } from '../accounts/schemas/account.schema';
import { BusinessClaim, BusinessClaimDocument, BusinessClaimSchema } from './schemas/business-claim.schema';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { BusinessImage, BusinessImageSchema } from '../businesses/schemas/business-image.schema';
import { Deal, DealDocument, DealSchema } from '../deals/schemas/deal.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { ProductImage, ProductImageSchema } from '../products/schemas/product-image.schema';
import { Discount, DiscountDocument, DiscountSchema } from '../discounts/schemas/discount.schema';
import { CustomerRequest, CustomerRequestDocument, CustomerRequestSchema } from '../requests/schemas/request.schema';
import { VendorImpression, VendorImpressionDocument, VendorImpressionSchema } from '../public/schemas/vendor-impression.schema';
import { CatalogGap, CatalogGapDocument, CatalogGapSchema } from '../public/schemas/catalog-gap.schema';
import { BusinessesService } from '../businesses/businesses.service';
import { ProductsService } from '../products/products.service';
import { DiscountsService } from '../discounts/discounts.service';
import { RequestsService } from '../requests/requests.service';
import { PriceCalcService } from '../pricing/price-calc.service';

// What these features promise is about data across collections — a bulk
// import matching existing rows, a discount surviving a price edit, stats
// counting the right shop's events — so the real services run against a real
// (in-memory) Mongo, the same way the requests and products specs do.
describe('VendorService — dashboard for every kind of shop', () => {
  let mongod: MongoMemoryServer;
  let service: VendorService;
  let requestsService: RequestsService;
  let discountsService: DiscountsService;
  let productModel: Model<ProductDocument>;
  let businessModel: Model<BusinessDocument>;
  let claimModel: Model<BusinessClaimDocument>;
  let accountModel: Model<AccountDocument>;
  let requestModel: Model<CustomerRequestDocument>;
  let impressionModel: Model<VendorImpressionDocument>;
  let gapModel: Model<CatalogGapDocument>;

  let accountId: string;
  let pharmacyId: string;
  let otherShopId: string;

  // Typed as any once here instead of a cast at each of the eleven models.
  const model = (name: string, schema: mongoose.Schema<any>): any => mongoose.model(name, schema);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    accountModel = model(Account.name, AccountSchema);
    claimModel = model(BusinessClaim.name, BusinessClaimSchema);
    businessModel = model(Business.name, BusinessSchema);
    productModel = model(Product.name, ProductSchema);
    requestModel = model(CustomerRequest.name, CustomerRequestSchema);
    impressionModel = model(VendorImpression.name, VendorImpressionSchema);
    gapModel = model(CatalogGap.name, CatalogGapSchema);
    const dealModel: Model<DealDocument> = model(Deal.name, DealSchema);
    const discountModel: Model<DiscountDocument> = model(Discount.name, DiscountSchema);
    const productImageModel = model(ProductImage.name, ProductImageSchema);
    const businessImageModel = model(BusinessImage.name, BusinessImageSchema);

    const productsService = new ProductsService(productModel, productImageModel as any);
    const priceCalcService = new PriceCalcService(productModel, discountModel, productsService);
    discountsService = new DiscountsService(discountModel, priceCalcService);
    requestsService = new RequestsService(requestModel, businessModel, productModel, dealModel);
    service = new VendorService(
      accountModel,
      claimModel,
      businessModel,
      dealModel,
      new BusinessesService(businessModel, businessImageModel as any),
      productsService,
      discountsService,
      requestsService,
      priceCalcService,
      productModel,
      requestModel,
      impressionModel,
      gapModel,
    );
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    const account = await accountModel.create({ email: 'shop@example.com', passwordHash: 'x', app: 'vendor' });
    accountId = String(account._id);
    const location = { type: 'Point', coordinates: [46.6753, 24.7136] };
    const pharmacy = await businessModel.create({ name: 'Al Dawaa', nameAr: 'صيدلية الدواء', categorySlug: 'pharmacy', location });
    const other = await businessModel.create({ name: 'Someone else', categorySlug: 'supermarket', location });
    pharmacyId = String(pharmacy._id);
    otherShopId = String(other._id);
    await claimModel.create({ accountId, businessId: pharmacyId, status: 'active' });
  });

  describe('verticals', () => {
    it('puts each kind of shop in the vertical whose wording and fields fit it', () => {
      expect(verticalFor('pharmacy')).toBe('pharmacy');
      expect(verticalFor('supermarket')).toBe('grocery');
      expect(verticalFor('restaurant')).toBe('food');
      expect(verticalFor('electronics')).toBe('retail');
      expect(verticalFor('hairdresser')).toBe('services');
      expect(verticalFor('mosque')).toBe('general');
      expect(verticalFor(null)).toBe('general');
    });

    it('tells the dashboard which vertical and storefront details each shop has', async () => {
      await businessModel.updateOne({ _id: pharmacyId }, { phone: '0112345678', openingHours: '٨ص - ١٢م' });
      const me = await service.me(accountId);
      expect(me.claims[0]).toMatchObject({ vertical: 'pharmacy', phone: '0112345678', openingHours: '٨ص - ١٢م' });
    });
  });

  describe('products', () => {
    it('stores unit, brand, barcode and only well-formed attributes', async () => {
      const product: any = await service.createOwnProduct(accountId, {
        businessId: pharmacyId,
        name: 'بنادول ٥٠٠',
        price: 12,
        unit: 'علبة',
        brand: '  GSK ',
        sku: '6281234567890',
        attributes: { requiresPrescription: false, activeIngredient: 'باراسيتامول', 'bad key': 'x', blank: '  ', nested: { a: 1 } },
      });
      expect(product).toMatchObject({ unit: 'علبة', brand: 'GSK', sku: '6281234567890', inStock: true });
      expect(product.attributes).toEqual({ requiresPrescription: false, activeIngredient: 'باراسيتامول' });
    });

    it('caps attributes at twenty and trims long values', () => {
      const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v'.repeat(300)]));
      const clean = sanitizeAttributes(many);
      expect(Object.keys(clean)).toHaveLength(20);
      expect((clean.k0 as string).length).toBe(200);
    });

    it('keeps a discount when the vendor edits the price', async () => {
      const product: any = await service.createOwnProduct(accountId, { businessId: pharmacyId, name: 'فيتامين د', price: 100 });
      await discountsService.create({ productId: String(product._id), type: 'percentage', value: 20 });
      const edited: any = await service.updateOwnProduct(accountId, String(product._id), { price: 50 });
      expect(edited.price).toBe(50);
      expect(edited.finalPrice).toBe(40);
    });

    it('cannot move a product to another shop by editing it', async () => {
      const product: any = await service.createOwnProduct(accountId, { businessId: pharmacyId, name: 'شاش', price: 5 });
      await service.updateOwnProduct(accountId, String(product._id), { businessId: otherShopId, name: 'شاش طبي' });
      const stored = await productModel.findById(product._id).lean();
      expect(String(stored!.businessId)).toBe(pharmacyId);
      expect(stored!.name).toBe('شاش طبي');
    });

    it('searches by name, barcode or brand and filters by category and stock', async () => {
      await service.bulkUpsertOwnProducts(accountId, {
        businessId: pharmacyId,
        rows: [
          { name: 'Panadol Extra', price: 15, category: 'أدوية', sku: '111', brand: 'GSK' },
          { name: 'Vitamin C', price: 30, category: 'فيتامينات', sku: '222', inStock: 'لا' },
          { name: 'Sunscreen', price: 80, category: 'عناية بالبشرة', brand: 'La Roche' },
        ],
      });

      const byBarcode = await service.listOwnProducts(accountId, { businessId: pharmacyId, q: '222' });
      expect(byBarcode.items.map((p: any) => p.name)).toEqual(['Vitamin C']);

      const byBrand = await service.listOwnProducts(accountId, { businessId: pharmacyId, q: 'roche' });
      expect(byBrand.items.map((p: any) => p.name)).toEqual(['Sunscreen']);

      const out = await service.listOwnProducts(accountId, { businessId: pharmacyId, stock: 'out' });
      expect(out.items.map((p: any) => p.name)).toEqual(['Vitamin C']);

      const all = await service.listOwnProducts(accountId, { businessId: pharmacyId, category: 'أدوية' });
      expect(all.total).toBe(1);
      expect(all.categories).toEqual(['أدوية', 'عناية بالبشرة', 'فيتامينات'].sort());
      expect(all.outOfStock).toBe(1);
    });

    it("refuses to list another shop's products", async () => {
      await expect(service.listOwnProducts(accountId, { businessId: otherShopId })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('bulk import', () => {
    it('updates rows it recognises by barcode or name and adds the rest', async () => {
      await service.createOwnProduct(accountId, { businessId: pharmacyId, name: 'Panadol', price: 10, sku: 'P1' });
      await service.createOwnProduct(accountId, { businessId: pharmacyId, name: 'Strepsils', price: 8 });

      const result = await service.bulkUpsertOwnProducts(accountId, {
        businessId: pharmacyId,
        rows: [
          { name: 'Panadol 500mg', price: '11.5', sku: 'P1' }, // same barcode, renamed
          { name: '  strepsils ', price: 9 }, // same name, different case/spacing
          { name: 'Otrivin', price: 14, unit: 'بخاخ', keywords: 'احتقان، زكام' },
          { name: '', price: 5 },
          { name: 'Bad price', price: 'abc' },
        ],
      });

      expect(result).toMatchObject({ created: 1, updated: 2 });
      expect(result.failed).toEqual([
        { index: 3, name: '', error: 'name_required' },
        { index: 4, name: 'Bad price', error: 'invalid_price' },
      ]);

      const products = await productModel.find({ businessId: pharmacyId }).sort({ name: 1 }).lean();
      expect(products.map((p) => [p.name, p.price])).toEqual([
        ['Otrivin', 14],
        ['Panadol 500mg', 11.5],
        ['strepsils', 9],
      ]);
      expect(products[0].keywords).toEqual(['احتقان', 'زكام']);
      expect(products[0].unit).toBe('بخاخ');
    });

    it('merges a file that lists the same item twice into one product', async () => {
      const result = await service.bulkUpsertOwnProducts(accountId, {
        businessId: pharmacyId,
        rows: [
          { name: 'Milk', price: 5 },
          { name: 'milk', price: 6 },
        ],
      });
      expect(result).toMatchObject({ created: 1, updated: 0 });
      const products = await productModel.find({ businessId: pharmacyId }).lean();
      expect(products).toHaveLength(1);
      expect(products[0].price).toBe(6);
    });

    it('leaves a discounted price alone when the row repeats the same price, and re-applies it when the price moves', async () => {
      const kept: any = await service.createOwnProduct(accountId, { businessId: pharmacyId, name: 'Kept', price: 100 });
      const moved: any = await service.createOwnProduct(accountId, { businessId: pharmacyId, name: 'Moved', price: 100 });
      await discountsService.create({ productId: String(kept._id), type: 'percentage', value: 10 });
      await discountsService.create({ productId: String(moved._id), type: 'percentage', value: 10 });

      await service.bulkUpsertOwnProducts(accountId, {
        businessId: pharmacyId,
        rows: [
          { name: 'Kept', price: 100, brand: 'X' },
          { name: 'Moved', price: 200 },
        ],
      });

      expect((await productModel.findById(kept._id).lean())!.finalPrice).toBe(90);
      expect((await productModel.findById(moved._id).lean())!.finalPrice).toBe(180);
    });

    // The global pipe from main.ts, verbatim: its implicit conversion once made
    // a per-row @IsObject reject every real request while service-level tests
    // passed.
    it('accepts a real JSON body through the global validation pipe', async () => {
      const pipe = new ValidationPipe({ transform: true, whitelist: true, transformOptions: { enableImplicitConversion: true } });
      const body = { businessId: pharmacyId, rows: [{ name: 'Panadol', price: '12.5', sku: '1' }, 'not a row'] };
      const dto = await pipe.transform(body, { type: 'body', metatype: BulkProductsDto });
      const result = await service.bulkUpsertOwnProducts(accountId, dto);
      expect(result).toMatchObject({ created: 1, updated: 0 });
      expect(result.failed).toEqual([{ index: 1, name: null, error: 'invalid_row' }]);
    });

    it("refuses to import into a shop the account doesn't run", async () => {
      await expect(
        service.bulkUpsertOwnProducts(accountId, { businessId: otherShopId, rows: [{ name: 'x', price: 1 }] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('storefront details', () => {
    it('saves phone, hours and address, and clears a blanked field', async () => {
      await businessModel.updateOne({ _id: pharmacyId }, { district: 'العليا' });
      const saved = await service.updateOwnPlace(accountId, pharmacyId, {
        phone: ' 0501234567 ',
        openingHours: '٢٤ ساعة',
        district: '',
      });
      expect(saved).toMatchObject({ phone: '0501234567', openingHours: '٢٤ ساعة', district: null });
    });

    it("can't edit a shop the account doesn't run", async () => {
      await expect(service.updateOwnPlace(accountId, otherShopId, { phone: '1' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('order stages', () => {
    const order = (businessId: string, fields: Record<string, unknown> = {}) =>
      requestModel.create({ businessId, customerName: 'سارة', customerPhone: '0500000000', items: [], total: 0, ...fields });

    it('moves an order forward and tells the old app it was handled', async () => {
      const r = await order(pharmacyId);
      const result = await service.setOwnRequestStage(accountId, String(r._id), { stage: 'ready', note: 'جاهز للاستلام' });
      expect(result).toMatchObject({ stage: 'ready', status: 'handled', vendorNote: 'جاهز للاستلام' });
    });

    it("won't take a finished order back a step", async () => {
      const r = await order(pharmacyId);
      await service.setOwnRequestStage(accountId, String(r._id), { stage: 'completed' });
      await expect(service.setOwnRequestStage(accountId, String(r._id), { stage: 'confirmed' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('reads an order handled before stages existed as completed', async () => {
      const r = await order(pharmacyId);
      await requestModel.collection.updateOne({ _id: r._id }, { $set: { status: 'handled' }, $unset: { stage: '' } });
      const [listed] = await requestsService.findForBusinesses([pharmacyId]);
      expect(listed.stage).toBe('completed');
      await expect(service.setOwnRequestStage(accountId, String(r._id), { stage: 'cancelled' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('the old "handled" button confirms a new order', async () => {
      const r = await order(pharmacyId);
      const result = await service.markOwnRequestHandled(accountId, String(r._id));
      expect(result).toMatchObject({ status: 'handled', stage: 'confirmed' });
    });

    it("can't touch another shop's order", async () => {
      const r = await order(otherShopId);
      await expect(service.setOwnRequestStage(accountId, String(r._id), { stage: 'cancelled' })).rejects.toThrow();
    });
  });

  describe('stats', () => {
    it("counts this shop's impressions, orders, sales and missing items, and nobody else's", async () => {
      const pid = new mongoose.Types.ObjectId(pharmacyId);
      const oid = new mongoose.Types.ObjectId(otherShopId);
      await impressionModel.insertMany([{ businessId: pid }, { businessId: pid }, { businessId: oid }]);

      const line = (label: string, quantity: number) => ({
        itemType: 'product',
        itemId: new mongoose.Types.ObjectId(),
        label,
        quantity,
        unitPrice: 10,
      });
      const base = { customerName: 'x', customerPhone: '1' };
      await requestModel.create([
        { ...base, businessId: pharmacyId, items: [line('بنادول', 2)], total: 20, stage: 'completed', status: 'handled' },
        { ...base, businessId: pharmacyId, items: [line('بنادول', 1), line('فيتامين', 1)], total: 20 },
        { ...base, businessId: pharmacyId, items: [line('شاش', 5)], total: 50, stage: 'cancelled', status: 'handled' },
        { ...base, businessId: otherShopId, items: [line('حليب', 9)], total: 90 },
      ]);

      await service.createOwnProduct(accountId, { businessId: pharmacyId, name: 'Zinc', price: 5, inStock: false });
      await gapModel.insertMany([
        { businessId: pharmacyId, requestedItem: 'كمامات' },
        { businessId: pharmacyId, requestedItem: 'كمامات' },
        { businessId: pharmacyId, requestedItem: 'zinc' }, // already listed — not a gap any more
        { businessId: otherShopId, requestedItem: 'خبز' },
      ]);

      const stats = await service.getStats(accountId, { businessId: pharmacyId, days: 7 });

      expect(stats.impressions.total).toBe(2);
      expect(stats.impressions.daily).toHaveLength(7);
      expect(stats.impressions.daily[6].count).toBe(2);
      expect(stats.requests).toMatchObject({ total: 3, waiting: 1, completedValue: 20 });
      expect(stats.requests.byStage).toMatchObject({ new: 1, completed: 1, cancelled: 1 });
      expect(stats.topItems[0]).toMatchObject({ label: 'بنادول', quantity: 3, orders: 2 });
      expect(stats.topItems.map((i: any) => i.label)).not.toContain('شاش'); // cancelled orders don't count
      expect(stats.catalog).toMatchObject({ total: 1, outOfStock: 1, withoutImage: 1, withoutCategory: 1 });
      expect(stats.gaps).toEqual([expect.objectContaining({ requestedItem: 'كمامات', count: 2 })]);
    });

    it("refuses stats for a shop the account doesn't run", async () => {
      await expect(service.getStats(accountId, { businessId: otherShopId })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
