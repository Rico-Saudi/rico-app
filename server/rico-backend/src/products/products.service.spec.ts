import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProductsService } from './products.service';
import { Product, ProductDocument, ProductSchema } from './schemas/product.schema';
import { ProductImage, ProductImageDocument, ProductImageSchema } from './schemas/product-image.schema';
import { MAX_PRODUCT_IMAGE_BYTES } from './constants/product-image.constants';

// The image rules worth testing span two collections — the URL on the product
// and the bytes behind it — so this runs the real service against a real
// (in-memory) Mongo rather than mocking the models.
describe('ProductsService images', () => {
  let mongod: MongoMemoryServer;
  let service: ProductsService;
  let productModel: Model<ProductDocument>;
  let imageModel: Model<ProductImageDocument>;

  const businessId = new mongoose.Types.ObjectId().toString();

  const upload = (overrides: Partial<Express.Multer.File> = {}) =>
    ({
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('a fake jpeg'),
      ...overrides,
    }) as Express.Multer.File;

  const newProduct = () => service.create({ businessId, name: 'تمر سكري', price: 25 });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    productModel = mongoose.model(Product.name, ProductSchema) as unknown as Model<ProductDocument>;
    imageModel = mongoose.model(ProductImage.name, ProductImageSchema) as unknown as Model<ProductImageDocument>;
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([productModel.deleteMany({}), imageModel.deleteMany({})]);
    service = new ProductsService(productModel, imageModel);
  });

  it('stores the bytes and points the product at a servable URL', async () => {
    const product = await newProduct();
    const saved = await service.setImage(product._id.toString(), upload());

    expect(saved.imageUrl).toMatch(/^\/products\/images\/[a-f0-9]{24}$/);

    const imageId = saved.imageUrl!.split('/').pop()!;
    const image = await service.findImage(imageId);
    expect(image.contentType).toBe('image/jpeg');
    expect(image.data.toString()).toBe('a fake jpeg');
  });

  it('carries the URL through the list query every read path uses', async () => {
    const product = await newProduct();
    await service.setImage(product._id.toString(), upload());

    const { items } = await service.findAll({ businessId, page: 1, limit: 10 });
    expect(items[0].imageUrl).toMatch(/^\/products\/images\//);
  });

  it('replaces a photo without leaving the old bytes behind', async () => {
    const product = await newProduct();
    const first = await service.setImage(product._id.toString(), upload());
    const second = await service.setImage(product._id.toString(), upload({ buffer: Buffer.from('a newer jpeg') }));

    // A new URL, so nothing can serve the replaced photo from a cache.
    expect(second.imageUrl).not.toBe(first.imageUrl);
    expect(await imageModel.countDocuments({ productId: product._id })).toBe(1);
    await expect(service.findImage(first.imageUrl!.split('/').pop()!)).rejects.toThrow();
  });

  it('drops the bytes when the photo is cleared', async () => {
    const product = await newProduct();
    await service.setImage(product._id.toString(), upload());
    const cleared = await service.clearImage(product._id.toString());

    expect(cleared.imageUrl).toBeNull();
    expect(await imageModel.countDocuments({ productId: product._id })).toBe(0);
  });

  it('refuses a file that is not an image we serve', async () => {
    const product = await newProduct();
    await expect(service.setImage(product._id.toString(), upload({ mimetype: 'application/pdf' }))).rejects.toMatchObject({
      status: 400,
    });
    expect((await service.findOne(product._id.toString())).imageUrl).toBeNull();
  });

  it('refuses a file past the size cap', async () => {
    const product = await newProduct();
    await expect(
      service.setImage(product._id.toString(), upload({ size: MAX_PRODUCT_IMAGE_BYTES + 1 })),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('answers a malformed image id with 404 rather than a driver error', async () => {
    await expect(service.findImage('not-an-object-id')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses an empty upload rather than storing a blank photo', async () => {
    const product = await newProduct();
    await expect(service.setImage(product._id.toString(), undefined)).rejects.toMatchObject({ status: 400 });
  });
});
