import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ApiUsageService } from '../api-usage/api-usage.service';
import { ApiUsage, ApiUsageDocument, ApiUsageSchema } from '../owner/schemas/api-usage.schema';
import { WebOfferCache, WebOfferCacheDocument, WebOfferCacheSchema } from './schemas/web-offer-cache.schema';
import { dealsQuery, parseLabels, SERPER_PROVIDER, WebOffersService } from './web-offers.service';
import { hasEnded, isWebLink, nearestCity, parsePrice } from './web-offers.util';

describe('web offer helpers', () => {
  it.each([
    ['SAR 12.50', 12.5, 'SAR'],
    ['12٫50 ر.س.', 12.5, 'SAR'],
    ['١٬٢٥٠ ر.س', 1250, 'SAR'],
    ['1,250.00 ريال', 1250, 'SAR'],
    ['JOD 3.250', 3.25, 'JOD'],
    ['3.25 د.أ', 3.25, 'JOD'],
    ['$4.99', 4.99, 'USD'],
    ['9.5', 9.5, null],
  ])('reads "%s" as %d %s', (raw, amount, currency) => {
    expect(parsePrice(raw)).toEqual({ amount, currency });
  });

  it('has no price for a string without a number', () => {
    expect(parsePrice('اتصل للسعر')).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice('0 ر.س')).toBeNull();
  });

  it('names the city the customer is in, and none far from all of them', () => {
    expect(nearestCity(24.75, 46.7)).toBe('الرياض');
    expect(nearestCity(31.96, 35.92)).toBe('عمّان');
    expect(nearestCity(22.5, 47.5)).toBeNull(); // the Empty Quarter
  });

  it('builds the search for a deals topic', () => {
    expect(dealsQuery(undefined, 'الرياض')).toBe('عروض اليوم الرياض');
    expect(dealsQuery('العروض', 'جدة')).toBe('عروض اليوم جدة');
    expect(dealsQuery('عروض المطاعم', 'الرياض')).toBe('عروض المطاعم الرياض');
    expect(dealsQuery('سوبرماركت', 'الدمام')).toBe('عروض سوبرماركت الدمام');
  });

  it('knows an end date that has passed, and never guesses on one it cannot read', () => {
    const today = new Date('2026-10-12T09:00:00Z');
    expect(hasEnded('30 سبتمبر', today)).toBe(true);
    expect(hasEnded('7 أكتوبر 2026', today)).toBe(true);
    expect(hasEnded('11-10-2026', today)).toBe(true);
    expect(hasEnded('12/10/2026', today)).toBe(false); // ends today: still on
    expect(hasEnded('١٤ اكتوبر', today)).toBe(false);
    expect(hasEnded('حتى نفاد الكمية', today)).toBe(false);
    expect(hasEnded(null, today)).toBe(false);
    // "30 ديسمبر" read in January is last December.
    expect(hasEnded('30 ديسمبر', new Date('2027-01-05T00:00:00Z'))).toBe(true);
  });

  it('only lets plain web links through', () => {
    expect(isWebLink('https://panda.com.sa/offers')).toBe(true);
    expect(isWebLink('javascript:alert(1)')).toBe(false);
    expect(isWebLink('intent://x#Intent;end')).toBe(false);
    expect(isWebLink(undefined)).toBe(false);
  });

  it("keeps only the model's labels that point at a real result and say something", () => {
    const labels = parseLabels(
      JSON.stringify({
        offers: [
          { i: 0, store: 'بنده', headline: 'عروض الأسبوع', discount: 'حتى 50%', validUntil: null },
          { i: 0, store: 'مكرر', headline: 'نفس النتيجة مرتين' },
          { i: 7, store: 'خارج القائمة', headline: 'رقم ما له نتيجة' },
          { i: 1, store: '', headline: 'بلا محل' },
          { i: '2', store: 'رقم نص', headline: 'x' },
        ],
      }),
      3,
    );
    expect(labels).toEqual([{ i: 0, store: 'بنده', headline: 'عروض الأسبوع', discount: 'حتى 50%', validUntil: null }]);
    // Judged results: only the kept ones count.
    expect(
      parseLabels(
        JSON.stringify({
          results: [
            { i: 0, keep: false, why: 'many stores' },
            { i: 1, keep: true, store: 'المدينة', headline: 'عروض 11 حتى 14 اكتوبر', discount: null, validUntil: '14 اكتوبر' },
          ],
        }),
        3,
      ),
    ).toEqual([{ i: 1, store: 'المدينة', headline: 'عروض 11 حتى 14 اكتوبر', discount: null, validUntil: '14 اكتوبر' }]);
    expect(parseLabels('not json', 3)).toBeNull();
    expect(parseLabels('{"nope":[]}', 3)).toBeNull();
  });
});

describe('WebOffersService', () => {
  let mongod: MongoMemoryServer;
  let cacheModel: Model<WebOfferCacheDocument>;
  let usageModel: Model<ApiUsageDocument>;
  let apiUsage: ApiUsageService;
  const llm = { complete: jest.fn() };
  let fetchMock: jest.SpyInstance;
  let serperCalls: { path: string; body: any }[];
  let serperReply: (path: string) => unknown;

  const HERE = { lat: 24.7136, lng: 46.6753 };
  const service = () => new WebOffersService(cacheModel, apiUsage, llm as any);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    cacheModel = mongoose.model(WebOfferCache.name, WebOfferCacheSchema) as unknown as Model<WebOfferCacheDocument>;
    usageModel = mongoose.model(ApiUsage.name, ApiUsageSchema) as unknown as Model<ApiUsageDocument>;
    apiUsage = new ApiUsageService(usageModel);
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([cacheModel.deleteMany({}), usageModel.deleteMany({})]);
    process.env.SERPER_API_KEY = 'test-key';
    delete process.env.SERPER_MONTHLY_CAP;
    serperCalls = [];
    llm.complete.mockReset();
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url: any, init: any) => {
      const path = String(url).split('/').pop()!;
      serperCalls.push({ path, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(serperReply(path)), { status: 200 });
    });
  });

  afterEach(() => fetchMock.mockRestore());

  const organic = [
    { title: 'عروض بنده الأسبوعية', link: 'https://panda.com.sa/offers', snippet: 'خصومات حتى 50% حتى 15 أكتوبر', date: 'قبل يومين' },
    { title: 'أخبار الاقتصاد اليوم', link: 'https://news.example/x', snippet: 'ارتفاع الأسعار' },
    { title: 'مهاجم', link: 'javascript:alert(1)', snippet: 'عروض' },
  ];

  it('searches this month\'s offers in the customer\'s city, in the brand\'s country', async () => {
    serperReply = () => ({ organic });
    llm.complete.mockResolvedValue({
      content: JSON.stringify({ offers: [{ i: 0, store: 'بنده', headline: 'عروض الأسبوع', discount: 'حتى 50%', validUntil: '15 أكتوبر' }] }),
    });

    const res = await service().findDeals({ ...HERE, brand: 'rico', topic: 'العروض' });

    expect(serperCalls).toEqual([{ path: 'search', body: { q: 'عروض اليوم الرياض', gl: 'sa', hl: 'ar', tbs: 'qdr:w', num: 10 } }]);
    // The model is told where the customer is, to drop offers from elsewhere.
    expect(llm.complete.mock.calls[0][0].messages[0].content).toContain('الرياض (السعودية)');
    expect(res.offers).toEqual([
      {
        store: 'بنده',
        headline: 'عروض الأسبوع',
        discount: 'حتى 50%',
        validUntil: '15 أكتوبر',
        url: 'https://panda.com.sa/offers',
        source: 'panda.com.sa',
        date: 'قبل يومين',
        imageUrl: null,
      },
    ]);
    // The model never saw the unsafe link.
    expect(llm.complete.mock.calls[0][0].messages[1].content).not.toContain('javascript');
  });

  it('answers the second customer from the cache, without paying again', async () => {
    serperReply = () => ({ organic });
    llm.complete.mockResolvedValue({ content: '{"offers":[{"i":0,"store":"بنده","headline":"عروض"}]}' });

    await service().findDeals({ ...HERE, brand: 'rico' });
    const again = await service().findDeals({ lat: 24.72, lng: 46.68, brand: 'rico' });

    expect(serperCalls).toHaveLength(1);
    expect(again.offers).toHaveLength(1);
    expect((await apiUsage.getUsage(SERPER_PROVIDER)).count).toBe(1);
  });

  it('falls back to the results that read as offers when the model fails', async () => {
    serperReply = () => ({ organic });
    llm.complete.mockRejectedValue(new Error('429'));

    const res = await service().findDeals({ ...HERE, brand: 'rico' });

    expect(res.offers.map((o) => o.headline)).toEqual(['عروض بنده الأسبوعية']);
    expect(res.offers[0].store).toBe('panda.com.sa');
  });

  it('stops calling Serper once the monthly cap is spent', async () => {
    process.env.SERPER_MONTHLY_CAP = '1';
    await apiUsage.increment(SERPER_PROVIDER);
    serperReply = () => ({ organic });

    const res = await service().findDeals({ ...HERE, brand: 'rico' });

    expect(serperCalls).toEqual([]);
    expect(res.offers).toEqual([]);
  });

  it('answers with nothing, not an error, when Serper is not configured or down', async () => {
    delete process.env.SERPER_API_KEY;
    expect((await service().findDeals({ ...HERE, brand: 'rico' })).offers).toEqual([]);

    process.env.SERPER_API_KEY = 'test-key';
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));
    expect((await service().findPrices({ ...HERE, brand: 'rico', items: [{ name: 'جبنة' }] })).comparisons[0].offers).toEqual([]);
    // A failure is not cached: the next customer tries again.
    expect(await cacheModel.countDocuments()).toBe(0);
  });

  it('ranks online prices cheapest first, in the market\'s currency only', async () => {
    serperReply = () => ({
      shopping: [
        { title: 'جبنة شيدر المراعي 500غ', source: 'نون', link: 'https://noon.com/a', price: '18.95 ر.س.' },
        { title: 'Cheddar import', source: 'amazon.com', link: 'https://amazon.com/b', price: '$4.99' },
        { title: 'جبنة بيضاء كرافت', source: 'كارفور', link: 'https://carrefourksa.com/c', price: 'SAR 12.50', delivery: 'توصيل مجاني' },
        { title: 'بلا سعر', source: 'x', link: 'https://x.sa', price: 'اتصل' },
      ],
    });

    const res = await service().findPrices({ ...HERE, brand: 'rico', items: [{ name: 'جبنة' }] });

    expect(serperCalls[0]).toEqual({ path: 'shopping', body: { q: 'جبنة', gl: 'sa', hl: 'ar', num: 10 } });
    expect(res.comparisons[0].requested).toBe('جبنة');
    expect(res.comparisons[0].offers.map((o) => [o.store, o.price, o.currency])).toEqual([
      ['كارفور', 12.5, 'SAR'],
      ['نون', 18.95, 'SAR'],
    ]);
    expect(res.comparisons[0].offers[0].delivery).toBe('توصيل مجاني');
  });

  it('names the country with Amman, so Google does not read it as Oman', async () => {
    serperReply = () => ({ organic: [] });

    await service().findDeals({ lat: 31.95, lng: 35.91, brand: 'tadallal' });

    expect(serperCalls[0].body).toMatchObject({ q: 'عروض اليوم عمّان الأردن', gl: 'jo' });
  });

  it('shows each store once, however many places posted its flyer', async () => {
    serperReply = () => ({
      organic: [
        { title: 'عروض كارفور الدمام', link: 'https://instagram.com/p/1', snippet: 'عروض' },
        { title: 'عروض كارفور الدمام', link: 'https://facebook.com/p/2', snippet: 'عروض' },
        { title: 'عروض نستو', link: 'https://nesto.sa', snippet: 'عروض' },
      ],
    });
    llm.complete.mockResolvedValue({
      content: JSON.stringify({
        results: [
          { i: 0, keep: true, store: 'كارفور', headline: 'عروض الأسبوع' },
          { i: 1, keep: true, store: 'الكارفور', headline: 'عروض الأسبوع' },
          { i: 2, keep: true, store: 'نستو', headline: 'عروض' },
        ],
      }),
    });

    const res = await service().findDeals({ lat: 26.42, lng: 50.09, brand: 'rico' });

    expect(res.offers.map((o) => [o.store, o.source])).toEqual([
      ['كارفور', 'instagram.com'],
      ['نستو', 'nesto.sa'],
    ]);
  });

  it('drops an offer whose end date the model copied out but has passed', async () => {
    serperReply = () => ({ organic });
    llm.complete.mockResolvedValue({
      content: JSON.stringify({
        results: [
          { i: 0, keep: true, store: 'بنده', headline: 'عروض اليوم الوطني', discount: null, validUntil: '30 سبتمبر 2020' },
          { i: 1, keep: false, why: 'news' },
        ],
      }),
    });

    expect((await service().findDeals({ ...HERE, brand: 'rico' })).offers).toEqual([]);
  });

  it('searches Jordan in dinars for تدلل', async () => {
    serperReply = () => ({ shopping: [{ title: 'لبنة', source: 'سامح مول', link: 'https://sameh.jo/l', price: '1.95 د.أ' }] });

    const res = await service().findPrices({ lat: 31.95, lng: 35.91, brand: 'tadallal', items: [{ name: 'لبنة' }] });

    expect(serperCalls[0].body.gl).toBe('jo');
    expect(res.comparisons[0].offers[0]).toMatchObject({ price: 1.95, currency: 'JOD' });
  });
});
