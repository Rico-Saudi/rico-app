import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RequestsService } from './requests.service';
import { CustomerRequest, CustomerRequestDocument, CustomerRequestSchema } from './schemas/request.schema';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { Deal, DealDocument, DealSchema } from '../deals/schemas/deal.schema';
import { CustomerDocument } from '../customers/schemas/customer.schema';
import { Discount, DiscountDocument, DiscountSchema } from '../discounts/schemas/discount.schema';
import { ProductImage, ProductImageSchema } from '../products/schemas/product-image.schema';
import { ProductsService } from '../products/products.service';
import { PriceCalcService } from '../pricing/price-calc.service';

// The basket rules worth testing are all about what the server refuses to take
// from the client — prices, labels, ownership — so this runs the real service
// against a real (in-memory) Mongo rather than mocking the models.
// Records what customers would be told; who gets the vendor's email is
// VendorService's spec's business.
const stageNotices: any[] = [];
const notifier = {
  notifyNewOrder: async () => 0,
  notifyCustomerStage: async (notice: any) => {
    stageNotices.push(notice);
    return true;
  },
};

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
    // Who gets emailed about an order is VendorService's spec's business.
    service = new RequestsService(requestModel, businessModel, productModel, dealModel, notifier as any);

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

  describe('what can be ordered', () => {
    it('refuses a product the shop has removed', async () => {
      await productModel.updateOne({ _id: tea._id }, { isActive: false });
      await expect(
        service.create({ businessId, items: [{ itemType: 'product', itemId: String(tea._id), quantity: 1 }] }, customer),
      ).rejects.toMatchObject({ response: { error: 'item_not_found' } });
    });

    it.each([
      ['still waiting for review', { status: 'pending_review' }],
      ['rejected', { status: 'rejected' }],
      ['past its end date', { status: 'active', endsAt: new Date(Date.now() - 60_000) }],
      ['not started yet', { status: 'active', startsAt: new Date(Date.now() + 60 * 60_000) }],
    ])('refuses a deal %s', async (_label, fields) => {
      const deal = await dealModel.create({
        businessId: new mongoose.Types.ObjectId(businessId),
        titleAr: 'عرض',
        dealType: 'bogo',
        source: 'vendor',
        ...fields,
      });
      await expect(
        service.create({ businessId, items: [{ itemType: 'deal', itemId: String(deal._id), quantity: 1 }] }, customer),
      ).rejects.toMatchObject({ response: { error: 'item_not_found' } });
    });
  });

  describe('prices at checkout', () => {
    let discountModel: Model<DiscountDocument>;
    let priced: RequestsService;

    beforeEach(async () => {
      discountModel = (mongoose.models[Discount.name] ??
        mongoose.model(Discount.name, DiscountSchema)) as unknown as Model<DiscountDocument>;
      const imageModel = mongoose.models[ProductImage.name] ?? mongoose.model(ProductImage.name, ProductImageSchema);
      await discountModel.deleteMany({});
      const priceCalc = new PriceCalcService(productModel, discountModel, new ProductsService(productModel, imageModel as any));
      priced = new RequestsService(requestModel, businessModel, productModel, dealModel, notifier as any, priceCalc);
    });

    it('drops a discount that ended by date, even though nothing rewrote the product', async () => {
      // The stored finalPrice (10) still reflects a discount that ended an hour ago.
      await discountModel.create({
        productId: tea._id,
        type: 'fixed',
        value: 10,
        endDate: new Date(Date.now() - 60 * 60_000),
      });
      const result = await priced.create(
        { businessId, items: [{ itemType: 'product', itemId: String(tea._id), quantity: 2 }] },
        customer,
      );
      expect(result.total).toBe(24);
    });

    it('applies a discount that started by date', async () => {
      await discountModel.create({
        productId: dates._id,
        type: 'percentage',
        value: 20,
        startDate: new Date(Date.now() - 60_000),
      });
      const result = await priced.create(
        { businessId, items: [{ itemType: 'product', itemId: String(dates._id), quantity: 1 }] },
        customer,
      );
      expect(result.total).toBe(20);
    });
  });

  describe('a retried confirm', () => {
    it('returns the order the first tap made instead of a second one', async () => {
      const body = { businessId, clientRef: 'tap-1234-abcd', items: [{ itemType: 'product' as const, itemId: String(tea._id), quantity: 1 }] };
      const first = await service.create(body, customer);
      const second = await service.create(body, customer);
      expect(String(second.requestId)).toBe(String(first.requestId));
      expect(await requestModel.countDocuments({})).toBe(1);
    });

    it('still lets a new tap make a new order', async () => {
      const line = [{ itemType: 'product' as const, itemId: String(tea._id), quantity: 1 }];
      await service.create({ businessId, clientRef: 'tap-aaaa-0001', items: line }, customer);
      await service.create({ businessId, clientRef: 'tap-aaaa-0002', items: line }, customer);
      expect(await requestModel.countDocuments({})).toBe(2);
    });
  });

  describe('the customer cancelling', () => {
    const order = () =>
      service.create({ businessId, items: [{ itemType: 'product', itemId: String(tea._id), quantity: 1 }] }, customer);

    it('works while the shop has not answered', async () => {
      const { requestId } = await order();
      await service.cancelByCustomer(String(requestId), String(customer._id));
      const saved = await requestModel.findById(requestId).lean();
      expect(saved).toMatchObject({ stage: 'cancelled', cancelledBy: 'customer', status: 'handled' });
    });

    it('is refused once the shop confirmed', async () => {
      const { requestId } = await order();
      await service.setStage(String(requestId), [businessId], 'confirmed');
      await expect(service.cancelByCustomer(String(requestId), String(customer._id))).rejects.toMatchObject({
        response: { error: 'too_late_to_cancel', stage: 'confirmed' },
      });
    });

    it("can't touch someone else's order", async () => {
      const { requestId } = await order();
      await expect(service.cancelByCustomer(String(requestId), String(new mongoose.Types.ObjectId()))).rejects.toMatchObject({
        response: { error: 'request_not_found' },
      });
    });
  });

  describe('an order nobody answers', () => {
    beforeEach(() => {
      stageNotices.length = 0;
    });

    it('is called off after the response window and the customer is told', async () => {
      const { requestId } = await service.create(
        { businessId, items: [{ itemType: 'product', itemId: String(tea._id), quantity: 1 }] },
        customer,
      );
      await requestModel.collection.updateOne({ _id: requestId as any }, { $set: { createdAt: new Date(Date.now() - 31 * 60_000) } });

      expect(await service.expireUnanswered()).toBe(1);
      await service.notifyWrite;
      const saved = await requestModel.findById(requestId).lean();
      expect(saved).toMatchObject({ stage: 'cancelled', cancelledBy: 'timeout' });
      expect(stageNotices[0]).toMatchObject({ stage: 'cancelled', cancelledBy: 'timeout', shopName: 'ريكو مارت' });
    });

    it('leaves a fresh order, and one the shop already confirmed, alone', async () => {
      const fresh = await service.create({ businessId, items: [{ itemType: 'product', itemId: String(tea._id), quantity: 1 }] }, customer);
      const answered = await service.create({ businessId, items: [{ itemType: 'product', itemId: String(dates._id), quantity: 1 }] }, customer);
      await service.setStage(String(answered.requestId), [businessId], 'confirmed');
      await requestModel.collection.updateOne(
        { _id: answered.requestId as any },
        { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } },
      );

      expect(await service.expireUnanswered()).toBe(0);
      expect((await requestModel.findById(fresh.requestId).lean())!.stage).toBe('new');
    });
  });

  describe('the shop moving an order on', () => {
    it('tells the customer, with the shop note', async () => {
      stageNotices.length = 0;
      const { requestId } = await service.create(
        { businessId, items: [{ itemType: 'product', itemId: String(tea._id), quantity: 1 }] },
        customer,
      );
      await service.setStage(String(requestId), [businessId], 'cancelled', 'خلص الشاي');
      await service.notifyWrite;
      expect(stageNotices[0]).toMatchObject({ stage: 'cancelled', cancelledBy: 'shop', note: 'خلص الشاي' });
    });
  });
});

describe('RequestsService anonymous orders', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('are refused once ALLOW_ANONYMOUS_ORDERS=false', async () => {
    process.env.ALLOW_ANONYMOUS_ORDERS = 'false';
    const service = new RequestsService(
      {} as any,
      { findById: () => ({ lean: async () => ({ _id: 'b1' }) }) } as any,
      {} as any,
      {} as any,
      notifier as any,
    );
    await expect(
      service.create({ businessId: 'b1', customerName: 'x', customerPhone: '0500000000', items: [] } as any),
    ).rejects.toMatchObject({ response: { error: 'sign_in_required' } });
  });
});
