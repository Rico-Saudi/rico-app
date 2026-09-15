import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalRequest, ProfessionalRequestDocument, ProfessionalRequestSchema } from './schemas/professional-request.schema';
import { Customer, CustomerDocument, CustomerSchema } from '../customers/schemas/customer.schema';
import { MailerService } from '../mailer/mailer.service';

// Against a real (in-memory) Mongo, because the rule that matters here is a
// $geoNear aggregation plus a $expr comparison against a per-document field —
// exactly the part a mocked model would assert nothing about.
describe('ProfessionalsService', () => {
  let mongod: MongoMemoryServer;
  let service: ProfessionalsService;
  let customerModel: Model<CustomerDocument>;
  let requestModel: Model<ProfessionalRequestDocument>;
  let sentEmails: { to: string; customerPhone: string }[];

  // Riyadh-ish. Longitude degrees are ~101km apart at this latitude, so a
  // 0.1° offset is comfortably outside a 10km service radius and inside a
  // 25km search radius — the exact gap these tests turn on.
  const ORIGIN = { lat: 24.7136, lng: 46.6753 };

  const KM_PER_LNG_DEGREE = 101;

  function atKm(km: number) {
    return { lat: ORIGIN.lat, lng: ORIGIN.lng + km / KM_PER_LNG_DEGREE };
  }

  async function makeProfessional({
    name,
    profession = 'painter',
    km = 1,
    serviceRadiusMeters = 15000,
    isAvailable = true,
    emailVerified = true,
    isActive = true,
  }: {
    name: string;
    profession?: string;
    km?: number;
    serviceRadiusMeters?: number;
    isAvailable?: boolean;
    emailVerified?: boolean;
    isActive?: boolean;
  }) {
    const at = atKm(km);
    return customerModel.create({
      name,
      email: `${name}@example.com`,
      passwordHash: 'x',
      phone: '+966500000000',
      emailVerified,
      isActive,
      professional: {
        profession,
        headline: null,
        serviceLocation: { type: 'Point', coordinates: [at.lng, at.lat] },
        serviceRadiusMeters,
        isAvailable,
      },
    });
  }

  const search = (overrides: Partial<{ profession: string; radius: number; limit: number }> = {}) =>
    service.search({ ...ORIGIN, profession: 'painter', radius: 25000, limit: 8, ...overrides });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    customerModel = mongoose.model(Customer.name, CustomerSchema) as unknown as Model<CustomerDocument>;
    requestModel = mongoose.model(
      ProfessionalRequest.name,
      ProfessionalRequestSchema,
    ) as unknown as Model<ProfessionalRequestDocument>;

    // $geoNear needs the 2dsphere index to exist, and mongoose only builds it
    // on connect for models registered before that point.
    await customerModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([customerModel.deleteMany({}), requestModel.deleteMany({})]);
    sentEmails = [];
    const mailer = {
      sendProfessionalRequestEmail: jest.fn(async ({ to, customerPhone }) => {
        sentEmails.push({ to, customerPhone });
      }),
    } as unknown as MailerService;
    service = new ProfessionalsService(customerModel, requestModel, mailer);
  });

  describe('search', () => {
    it('returns the nearest professional of that trade first', async () => {
      await makeProfessional({ name: 'far', km: 8 });
      await makeProfessional({ name: 'near', km: 2 });

      const { professionals } = await search();

      expect(professionals.map((p) => p.name)).toEqual(['near', 'far']);
      expect(professionals[0].distanceMeters).toBeLessThan(professionals[1].distanceMeters);
    });

    it('never exposes a phone number or email', async () => {
      await makeProfessional({ name: 'someone' });

      const { professionals } = await search();

      expect(professionals).toHaveLength(1);
      expect(Object.keys(professionals[0]).sort()).toEqual(
        ['distanceMeters', 'headline', 'id', 'name', 'profession', 'professionLabel', 'serviceRadiusMeters'].sort(),
      );
    });

    it('hides a professional the customer is outside the service radius of', async () => {
      // Willing to travel 10km, but the customer is ~20km away: inside the
      // search radius, outside theirs, so they must not be offered.
      await makeProfessional({ name: 'homebody', km: 20, serviceRadiusMeters: 10000 });
      await makeProfessional({ name: 'traveller', km: 20, serviceRadiusMeters: 50000 });

      const { professionals } = await search();

      expect(professionals.map((p) => p.name)).toEqual(['traveller']);
    });

    it('excludes other trades, unavailable, unverified and disabled accounts', async () => {
      await makeProfessional({ name: 'plumber', profession: 'plumber' });
      await makeProfessional({ name: 'busy', isAvailable: false });
      await makeProfessional({ name: 'unverified', emailVerified: false });
      await makeProfessional({ name: 'disabled', isActive: false });
      await makeProfessional({ name: 'findable' });

      const { professionals } = await search();

      expect(professionals.map((p) => p.name)).toEqual(['findable']);
    });

    it('resolves the Arabic label server-side', async () => {
      await makeProfessional({ name: 'someone', profession: 'ac_technician' });

      const { professionals } = await search({ profession: 'ac_technician' });

      expect(professionals[0].professionLabel).toBe('فني تكييف');
    });
  });

  describe('createRequest', () => {
    it('snapshots the requester name and phone from the account, not the body', async () => {
      const professional = await makeProfessional({ name: 'painter' });
      const customer = await customerModel.create({
        name: 'ماهر',
        email: 'customer@example.com',
        passwordHash: 'x',
        phone: '+966512345678',
        emailVerified: true,
      });

      await service.createRequest(
        { professionalId: String(professional._id), note: '  أبي أدهن غرفتين  ', ...ORIGIN },
        customer,
      );

      const [saved] = await requestModel.find({}).lean();
      expect(saved.customerName).toBe('ماهر');
      expect(saved.customerPhone).toBe('+966512345678');
      expect(saved.note).toBe('أبي أدهن غرفتين');
      expect(saved.profession).toBe('painter');
      expect(saved.status).toBe('new');
      // ~1km away, per makeProfessional's default.
      expect(saved.distanceMeters).toBeGreaterThan(500);
      expect(saved.distanceMeters).toBeLessThan(1500);
    });

    it('emails the professional but does not fail when the mail does', async () => {
      const professional = await makeProfessional({ name: 'painter' });
      const customer = await customerModel.create({
        name: 'ماهر',
        email: 'customer@example.com',
        passwordHash: 'x',
        phone: '+966512345678',
        emailVerified: true,
      });

      await service.createRequest({ professionalId: String(professional._id) }, customer);
      // notify() is fire-and-forget; let its microtask run.
      await new Promise((resolve) => setImmediate(resolve));

      expect(sentEmails).toEqual([{ to: 'painter@example.com', customerPhone: '+966512345678' }]);
    });

    it('refuses a request to yourself', async () => {
      const self = await makeProfessional({ name: 'painter' });

      await expect(service.createRequest({ professionalId: String(self._id) }, self)).rejects.toThrow();
    });

    it('refuses a request to someone who no longer offers a trade', async () => {
      const customer = await customerModel.create({
        name: 'ماهر',
        email: 'customer@example.com',
        passwordHash: 'x',
        phone: '+966512345678',
        emailVerified: true,
      });

      await expect(
        service.createRequest({ professionalId: String(customer._id) }, customer),
      ).rejects.toThrow();
    });
  });

  describe('incoming requests', () => {
    it('only ever lists and updates your own leads', async () => {
      const mine = await makeProfessional({ name: 'mine' });
      const theirs = await makeProfessional({ name: 'theirs', km: 2 });
      const customer = await customerModel.create({
        name: 'ماهر',
        email: 'customer@example.com',
        passwordHash: 'x',
        phone: '+966512345678',
        emailVerified: true,
      });

      await service.createRequest({ professionalId: String(mine._id) }, customer);
      await service.createRequest({ professionalId: String(theirs._id) }, customer);

      const { requests } = await service.listIncoming(mine._id);
      expect(requests).toHaveLength(1);

      await expect(service.markHandled(requests[0].id, theirs._id)).rejects.toThrow();
      const updated = await service.markHandled(requests[0].id, mine._id);
      expect(updated.status).toBe('handled');
    });
  });
});
