import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoIdPipe } from './pipes/mongo-id.pipe';
import { toCsv } from './utils/csv.util';
import { publicBaseUrl } from './utils/base-url.util';
import { ApiUsageService } from '../api-usage/api-usage.service';
import { ApiUsage, ApiUsageDocument, ApiUsageSchema } from '../owner/schemas/api-usage.schema';
import { PriceCalcService } from '../pricing/price-calc.service';
import { SessionGuard } from './guards/session.guard';

describe('MongoIdPipe', () => {
  const pipe = new MongoIdPipe();

  it('passes a real id through', () => {
    expect(pipe.transform('64b7f0c2a1b2c3d4e5f60718')).toBe('64b7f0c2a1b2c3d4e5f60718');
  });

  it('refuses the operator object Express builds from ?businessId[$ne]=…', () => {
    expect(() => pipe.transform({ $ne: '000000000000000000000000' })).toThrow();
  });

  it('refuses a missing id unless told it is optional', () => {
    expect(() => pipe.transform(undefined)).toThrow();
    expect(new MongoIdPipe({ optional: true }).transform(undefined)).toBeUndefined();
  });

  it('refuses a 12-character string mongoose would otherwise accept as an id', () => {
    expect(() => pipe.transform('aaaaaaaaaaaa')).toThrow();
  });
});

describe('toCsv', () => {
  const csv = (value: unknown) => toCsv([{ v: value }], [{ key: 'v', header: 'v' }]).split('\r\n')[1];

  it('neutralises a cell a spreadsheet would run as a formula', () => {
    expect(csv('=HYPERLINK("http://x","click")')).toBe(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(csv('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csv('+cmd|calc')).toBe(`'+cmd|calc`);
  });

  it('leaves phone numbers and negative numbers alone', () => {
    expect(csv('+962 79 123 4567')).toBe('+962 79 123 4567');
    expect(csv(-5)).toBe('-5');
    expect(csv('-5')).toBe('-5');
  });
});

describe('publicBaseUrl', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const req = { protocol: 'https', get: () => 'evil.example' } as any;

  it('ignores the Host header in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_BASE_URL;
    expect(publicBaseUrl(req)).toBe('https://app.rico-go.com');
  });

  it('prefers APP_BASE_URL when set', () => {
    process.env.APP_BASE_URL = 'https://staging.rico-go.com/';
    expect(publicBaseUrl(req)).toBe('https://staging.rico-go.com');
  });
});

describe('PriceCalcService.computeFinalPrice', () => {
  const calc = new PriceCalcService({} as any, {} as any, {} as any);

  it('never goes negative or above the list price', () => {
    expect(calc.computeFinalPrice(20, { type: 'percentage', value: 150 })).toBe(0);
    expect(calc.computeFinalPrice(20, { type: 'fixed', value: 35 })).toBe(20);
    expect(calc.computeFinalPrice(20, { type: 'percentage', value: 25 })).toBe(15);
  });
});

describe('SessionGuard after a password reset', () => {
  const guardFor = (account: Record<string, unknown>) =>
    new SessionGuard({ getAllAndOverride: () => undefined } as any, {
      findById: () => ({ lean: async () => account }),
    } as any);
  const context = (session: Record<string, unknown>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ session }) }), getHandler: () => null, getClass: () => null }) as any;

  it('ends sessions opened before the password changed', async () => {
    const guard = guardFor({ isActive: true, app: 'vendor', passwordChangedAt: new Date() });
    await expect(guard.canActivate(context({ accountId: 'a', issuedAt: Date.now() - 60_000 }))).rejects.toBeDefined();
    await expect(guard.canActivate(context({ accountId: 'a' }))).rejects.toBeDefined();
  });

  it('keeps sessions opened after it', async () => {
    const guard = guardFor({ isActive: true, app: 'vendor', passwordChangedAt: new Date(Date.now() - 60_000) });
    await expect(guard.canActivate(context({ accountId: 'a', issuedAt: Date.now() }))).resolves.toBe(true);
  });
});

describe('ApiUsageService.tryConsume', () => {
  let mongod: MongoMemoryServer;
  let usageModel: Model<ApiUsageDocument>;
  let service: ApiUsageService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    usageModel = mongoose.model(ApiUsage.name, ApiUsageSchema) as unknown as Model<ApiUsageDocument>;
    await usageModel.syncIndexes();
    service = new ApiUsageService(usageModel);
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('lets exactly `cap` concurrent callers through', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => service.tryConsume('google_places', 5)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect((await service.getUsage('google_places')).count).toBe(5);
  });
});
