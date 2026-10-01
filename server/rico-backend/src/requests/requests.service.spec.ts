import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RequestsService } from './requests.service';
import { CustomerRequest, CustomerRequestDocument, CustomerRequestSchema } from './schemas/request.schema';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { Deal, DealDocument, DealSchema } from '../deals/schemas/deal.schema';
import { CustomerDocument } from '../customers/schemas/customer.schema';

// The basket rules worth testing are all about what the server refuses to take
// from the client — prices, labels, ownership — so this runs the real service
// against a real (in-memory) Mongo rather than mocking the models.
describe('RequestsService baskets', () => {
  let mongod: MongoMemoryServer;
  let service: RequestsService;
  let requestModel: Model<CustomerRequestDocument>;
  let businessModel: Model<BusinessDocument>;
  let productModel: Model<ProductDocument>;
  let dealModel: Model<DealDocument>;

  let businessId: string;
  let tea: ProductDocument;
  let dates: ProductDocument;

  const customer = {
    _id: new mongoose.Types.ObjectId(),
    name: 'ماهر',
    phone: '+966512345678',
  } as unknown as CustomerDocument;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    requestModel = mongoose.model(CustomerRequest.name, CustomerRequestSchema) as unknown as Model<CustomerRequestDocument>;
    businessModel = mongoose.model(Business.name, BusinessSchema) as unknown as Model<BusinessDocument>;
    productModel = mongoose.model(Product.name, ProductSchema) as unknown as Model<ProductDocument>;
    dealModel = mongoose.model(Deal.name, DealSchema) as unknown as Model<DealDocument>;
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  // Business requires a category and a geo point; neither matters to a basket,
  // so they're filled in once here rather than at every call site.
  const makeBusiness = (fields: Record<string, unknown>) =>
    businessModel.create({
      categorySlug: 'grocery',
      location: { type: 'Point', coordinates: [46.6753, 24.7136] },
      ...fields,
    });

  beforeEach(async () => {
    await Promise.all([
      requestModel.deleteMany({}),
      businessModel.deleteMany({}),
      productModel.deleteMany({}),
      dealModel.deleteMany({}),
    ]);
    service = new RequestsService(requestModel, businessModel, productModel, dealModel);

    const business = await makeBusiness({ name: 'Rico Mart', nameAr: 'ريكو مارت' });
    businessId = String(business._id);
    tea = await productModel.create({
      businessId: business._id,
      name: 'شاي',
      price: 12,
      finalPrice: 10,
      imageUrl: '/products/images/aaaaaaaaaaaaaaaaaaaaaaaa',
    });
    dates = await productModel.create({ businessId: business._id, name: 'تمر', price: 25, finalPrice: 25 });
  });

  it('records every line of a basket with a server-derived price and total', async () => {
    const result = await service.create(
      {
        businessId,
        items: [
          { itemType: 'product', itemId: String(tea._id), quantity: 3 },
          { itemType: 'product', itemId: String(dates._id), quantity: 2 },
        ],
      },
      customer,
    );

    expect(result.itemCount).toBe(2);
    // 3 x 10 + 2 x 25 — computed from finalPrice, which is what the shopper saw.
    expect(result.total).toBe(80);

    const saved = await requestModel.findById(result.requestId).lean();
    expect(saved!.items.map((i) => [i.label, i.quantity])).toEqual([
      ['شاي', 3],
      ['تمر', 2],
    ]);
    expect(saved!.items[0].imageUrl).toBe('/products/images/aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('merges a repeated item into one line rather than listing it twice', async () => {
    const result = await service.create(
      {
        businessId,
        items: [
          { itemType: 'product', itemId: String(tea._id), quantity: 2 },
          { itemType: 'product', itemId: String(tea._id), quantity: 1 },
        ],
      },
      customer,
    );

    const saved = await requestModel.findById(result.requestId).lean();
    expect(saved!.items).toHaveLength(1);
    expect(saved!.items[0].quantity).toBe(3);
    expect(result.total).toBe(30);
  });

  it('ignores a price the client tries to send and uses the real one', async () => {
    const result = await service.create(
      {
        businessId,
        // A client that inflates its own basket shape gets no say: unitPrice
        // is read from the product, not from the wire.
        items: [{ itemType: 'product', itemId: String(tea._id), quantity: 1, unitPrice: 1 } as any],
      },
      customer,
    );

    const saved = await requestModel.findById(result.requestId).lean();
    expect(saved!.items[0].unitPrice).toBe(10);
    expect(saved!.total).toBe(10);
  });

  it('refuses a basket holding a product from another business', async () => {
    const other = await makeBusiness({ name: 'Elsewhere' });
    const foreign = await productModel.create({ businessId: other._id, name: 'غريب', price: 5, finalPrice: 5 });

    await expect(
      service.create(
        { businessId, items: [{ itemType: 'product', itemId: String(foreign._id), quantity: 1 }] },
        customer,
      ),
    ).rejects.toMatchObject({ status: 404 });

    expect(await requestModel.countDocuments({})).toBe(0);
  });

  it('still accepts the single-item shape older app builds send', async () => {
    const result = await service.create(
      { businessId, itemType: 'product', itemId: String(dates._id) },
      customer,
    );

    const saved = await requestModel.findById(result.requestId).lean();
    expect(saved!.items).toHaveLength(1);
    expect(saved!.items[0].quantity).toBe(1);
    expect(saved!.total).toBe(25);
  });

  it('refuses a basket with no items at all', async () => {
    await expect(service.create({ businessId }, customer)).rejects.toMatchObject({ status: 400 });
  });

  it('reads a pre-basket request back as a one-line basket', async () => {
    // Written the way the old code wrote it, straight past the current shape.
    await requestModel.collection.insertOne({
      businessId: new mongoose.Types.ObjectId(businessId),
      customerId: null,
      customerName: 'قديم',
      customerPhone: '+966500000000',
      itemType: 'product',
      itemId: tea._id,
      itemLabel: 'شاي',
      itemDetail: '10 ر.س',
      status: 'new',
      createdAt: new Date(),
    });

    const [lead] = await service.findForBusinesses([businessId]);
    expect(lead.items).toHaveLength(1);
    expect(lead.items[0]).toMatchObject({ label: 'شاي', detail: '10 ر.س', quantity: 1 });
    expect(lead.total).toBe(0);
  });

  describe('order history', () => {
    it('returns only the orders this customer placed, newest first', async () => {
      const other = {
        _id: new mongoose.Types.ObjectId(),
        name: 'شخص آخر',
        phone: '+966599999999',
      } as unknown as CustomerDocument;

      await service.create({ businessId, items: [{ itemType: 'product', itemId: String(tea._id) }] }, customer);
      await service.create({ businessId, items: [{ itemType: 'product', itemId: String(dates._id) }] }, other);
      await service.create({ businessId, items: [{ itemType: 'product', itemId: String(dates._id), quantity: 2 }] }, customer);

      const orders = await service.findForCustomer(String(customer._id));

      expect(orders).toHaveLength(2);
      expect(orders[0].items[0].label).toBe('تمر'); // الأحدث أولاً
      expect(orders[0].total).toBe(50);
      expect(orders[1].items[0].label).toBe('شاي');
      expect(orders.every((o) => o.businessName === 'ريكو مارت')).toBe(true);
    });

    it('does not hand an anonymous order to a customer who shares its phone', async () => {
      // طلب بلا حساب: نفس الرقم، لكن customerId فيه null.
      await service.create(
        { businessId, customerName: 'ماهر', customerPhone: customer.phone, items: [{ itemType: 'product', itemId: String(tea._id) }] },
      );

      expect(await service.findForCustomer(String(customer._id))).toHaveLength(0);
    });

    it('carries the line images so history can show what was ordered', async () => {
      await service.create({ businessId, items: [{ itemType: 'product', itemId: String(tea._id), quantity: 2 }] }, customer);

      const [order] = await service.findForCustomer(String(customer._id));
      expect(order.items[0].imageUrl).toBe('/products/images/aaaaaaaaaaaaaaaaaaaaaaaa');
      expect(order.status).toBe('new');
    });
  });

  it('totals a deal-only basket at zero without dropping the line', async () => {
    const deal = await dealModel.create({
      businessId: new mongoose.Types.ObjectId(businessId),
      titleAr: 'اشتري واحد والثاني مجاناً',
      dealType: 'bogo',
      status: 'active',
      source: 'vendor',
    });

    const result = await service.create(
      { businessId, items: [{ itemType: 'deal', itemId: String(deal._id), quantity: 1 }] },
      customer,
    );

    const saved = await requestModel.findById(result.requestId).lean();
    expect(saved!.items[0]).toMatchObject({ itemType: 'deal', unitPrice: null });
    expect(saved!.total).toBe(0);
  });
});
