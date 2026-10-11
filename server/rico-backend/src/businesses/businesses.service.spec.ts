import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BusinessesService } from './businesses.service';
import { Business, BusinessDocument, BusinessSchema } from './schemas/business.schema';
import { BusinessImage, BusinessImageDocument, BusinessImageSchema } from './schemas/business-image.schema';
import { MAX_BUSINESS_IMAGE_BYTES } from './constants/business-image.constants';

// Same reasoning as ProductsService images: the rules span two collections —
// the URL on the business and the bytes behind it — so this runs the real
// service against a real (in-memory) Mongo rather than mocking the models.
describe('BusinessesService images', () => {
  let mongod: MongoMemoryServer;
  let service: BusinessesService;
  let businessModel: Model<BusinessDocument>;
  let imageModel: Model<BusinessImageDocument>;

  const upload = (overrides: Partial<Express.Multer.File> = {}) =>
    ({
      mimetype: 'image/jpeg',
      size: 1024,
      buffer: Buffer.from('a fake jpeg'),
      ...overrides,
    }) as Express.Multer.File;

  const newBusiness = () =>
    service.create({ name: 'Cheap Eats', nameAr: 'ركن الأكل', categorySlug: 'restaurant', lat: 24.7, lng: 46.6 } as any);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    businessModel = mongoose.model(Business.name, BusinessSchema) as unknown as Model<BusinessDocument>;
    imageModel = mongoose.model(BusinessImage.name, BusinessImageSchema) as unknown as Model<BusinessImageDocument>;
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([businessModel.deleteMany({}), imageModel.deleteMany({})]);
    service = new BusinessesService(businessModel, imageModel);
  });

  it('a manually created business starts with no photo at all', async () => {
    // This is the gap the whole feature exists to close: a vendor onboarded by
    // hand has neither an uploaded photo nor a Google reference.
    const business = await newBusiness();
    expect(business.imageUrl).toBeNull();
    expect(business.photoRef).toBeNull();
  });

  it('stores the uploaded photo and points the business at it', async () => {
    const business = await newBusiness();
    const saved = await service.setImage(String(business._id), upload());

    expect(saved.imageUrl).toMatch(/^\/businesses\/images\/[a-f0-9]{24}$/);

    const imageId = saved.imageUrl!.split('/').pop()!;
    const image = await service.findImage(imageId);
    expect(image.contentType).toBe('image/jpeg');
    expect(image.data.length).toBeGreaterThan(0);
  });

  it('replacing a photo mints a new URL and drops the old bytes', async () => {
    // The URL is keyed by the image id precisely so a replacement can never be
    // served from a cache holding the previous photo.
    const business = await newBusiness();
    const first = await service.setImage(String(business._id), upload());
    const second = await service.setImage(String(business._id), upload({ buffer: Buffer.from('another jpeg') }));

    expect(second.imageUrl).not.toBe(first.imageUrl);
    await expect(service.findImage(first.imageUrl!.split('/').pop()!)).rejects.toThrow();
    expect(await imageModel.countDocuments({ businessId: business._id })).toBe(1);
  });

  it('clearing a photo removes both the URL and the bytes', async () => {
    const business = await newBusiness();
    await service.setImage(String(business._id), upload());
    const cleared = await service.clearImage(String(business._id));

    expect(cleared.imageUrl).toBeNull();
    expect(await imageModel.countDocuments({ businessId: business._id })).toBe(0);
  });

  it('refuses a file type we would not be able to serve back', async () => {
    const business = await newBusiness();
    await expect(service.setImage(String(business._id), upload({ mimetype: 'application/pdf' }))).rejects.toThrow();
  });

  it('refuses an oversized upload rather than storing it', async () => {
    const business = await newBusiness();
    await expect(
      service.setImage(String(business._id), upload({ size: MAX_BUSINESS_IMAGE_BYTES + 1 })),
    ).rejects.toThrow();
    expect(await imageModel.countDocuments({})).toBe(0);
  });

  it('refuses an empty upload', async () => {
    const business = await newBusiness();
    await expect(service.setImage(String(business._id), upload({ buffer: Buffer.alloc(0) }))).rejects.toThrow();
  });
});
