import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { DealsService } from './deals.service';
import { Deal, DealDocument, DealSchema } from './schemas/deal.schema';
import { Business, BusinessDocument, BusinessSchema } from '../businesses/schemas/business.schema';
import { WeatherSnapshot } from '../weather/weather.constants';

// Weather does two different jobs here and they must not be confused: a
// vendor's own targeting *excludes* deals, while category affinity only
// *reorders* them. Getting that backwards would either hide offers nobody
// asked to hide, or show a rainy-day deal in August.
describe('DealsService weather handling', () => {
  let mongod: MongoMemoryServer;
  let dealModel: Model<DealDocument>;
  let businessModel: Model<BusinessDocument>;

  const RIYADH = { lat: 24.7136, lng: 46.6753 };

  const snapshot = (bucket: WeatherSnapshot['bucket']): WeatherSnapshot => ({
    tempC: 44,
    condition: 'clear',
    bucket,
    notable: true,
    descriptionAr: 'الجو حار، ٤٤°',
  });

  const serviceWith = (weather: WeatherSnapshot | null) =>
    new DealsService(dealModel, businessModel, { getFor: async () => weather } as any);

  /** Places a business `metres` east of the centre so distance is predictable. */
  const seedBusiness = async (name: string, categorySlug: string, metres: number) => {
    const degrees = metres / 111_320 / Math.cos((RIYADH.lat * Math.PI) / 180);
    return businessModel.create({
      name,
      categorySlug,
      location: { type: 'Point', coordinates: [RIYADH.lng + degrees, RIYADH.lat] },
      isActive: true,
    });
  };

  const seedDeal = (businessId: any, titleAr: string, weatherConditions: string[] | null = null) =>
    dealModel.create({
      businessId,
      titleAr,
      dealType: 'percent',
      value: 20,
      status: 'active',
      source: 'manual',
      weatherConditions,
    });

  const titles = async (weather: WeatherSnapshot | null) => {
    const { deals } = await serviceWith(weather).findNearby(RIYADH.lat, RIYADH.lng, 5000, new Date());
    return deals.map((d: any) => d.titleAr);
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    dealModel = mongoose.model(Deal.name, DealSchema) as unknown as Model<DealDocument>;
    businessModel = mongoose.model(Business.name, BusinessSchema) as unknown as Model<BusinessDocument>;
    await businessModel.createIndexes();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([dealModel.deleteMany({}), businessModel.deleteMany({})]);
  });

  describe('a vendor targeting their deal at certain weather', () => {
    it('hides it when the weather is something else', async () => {
      const cafe = await seedBusiness('Cafe', 'cafe', 100);
      await seedDeal(cafe._id, 'عرض الشتاء', ['rain']);

      expect(await titles(snapshot('hot'))).toEqual([]);
    });

    it('shows it when the weather matches', async () => {
      const cafe = await seedBusiness('Cafe', 'cafe', 100);
      await seedDeal(cafe._id, 'قهوة مثلجة', ['hot']);

      expect(await titles(snapshot('hot'))).toEqual(['قهوة مثلجة']);
    });

    it('leaves untargeted deals alone in every weather', async () => {
      const shop = await seedBusiness('Shop', 'clothes', 100);
      await seedDeal(shop._id, 'خصم عام');

      expect(await titles(snapshot('hot'))).toEqual(['خصم عام']);
      expect(await titles(snapshot('rain'))).toEqual(['خصم عام']);
    });

    it('shows everything when the weather is unknown', async () => {
      // Failing open: an outage at OpenWeather must not quietly hide a
      // vendor's offers.
      const cafe = await seedBusiness('Cafe', 'cafe', 100);
      await seedDeal(cafe._id, 'عرض الشتاء', ['rain']);

      expect(await titles(null)).toEqual(['عرض الشتاء']);
    });
  });

  describe('category affinity', () => {
    it('favours a deal that suits the weather over a slightly nearer one', async () => {
      const shoes = await seedBusiness('Shoes', 'shoe_store', 1000);
      const cafe = await seedBusiness('Cafe', 'cafe', 1200);
      await seedDeal(shoes._id, 'خصم أحذية');
      await seedDeal(cafe._id, 'خصم كافيه');

      // 1200m × 0.7 = 840 beats 1000m, so the cafe leads on a hot day.
      expect(await titles(snapshot('hot'))).toEqual(['خصم كافيه', 'خصم أحذية']);
    });

    it('still puts a clearly nearer deal first', async () => {
      // The nudge is bounded — nobody is sent across town for a cold drink.
      const shoes = await seedBusiness('Shoes', 'shoe_store', 200);
      const cafe = await seedBusiness('Cafe', 'cafe', 2000);
      await seedDeal(shoes._id, 'خصم أحذية');
      await seedDeal(cafe._id, 'خصم كافيه');

      expect(await titles(snapshot('hot'))).toEqual(['خصم أحذية', 'خصم كافيه']);
    });

    it('orders purely by distance when the weather has no opinion', async () => {
      const cafe = await seedBusiness('Cafe', 'cafe', 1200);
      const shoes = await seedBusiness('Shoes', 'shoe_store', 1000);
      await seedDeal(cafe._id, 'خصم كافيه');
      await seedDeal(shoes._id, 'خصم أحذية');

      expect(await titles(snapshot('mild'))).toEqual(['خصم أحذية', 'خصم كافيه']);
    });

    it('does not reorder anything when the weather is unknown', async () => {
      const cafe = await seedBusiness('Cafe', 'cafe', 1200);
      const shoes = await seedBusiness('Shoes', 'shoe_store', 1000);
      await seedDeal(cafe._id, 'خصم كافيه');
      await seedDeal(shoes._id, 'خصم أحذية');

      expect(await titles(null)).toEqual(['خصم أحذية', 'خصم كافيه']);
    });
  });
});
