import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProfessionsService } from './professions.service';
import { ProfessionEntry, ProfessionEntryDocument, ProfessionEntrySchema } from './schemas/profession.schema';
import { Customer, CustomerDocument, CustomerSchema } from '../customers/schemas/customer.schema';
import { PROFESSIONS } from './constants/professions';
import { professionRegistry } from './constants/professions.registry';

// Against a real (in-memory) Mongo: what matters here is the seam between
// the collection and the in-process registry every other part of the server
// validates against, and a mocked model would assert nothing about it.
describe('ProfessionsService', () => {
  let mongod: MongoMemoryServer;
  let service: ProfessionsService;
  let professionModel: Model<ProfessionEntryDocument>;
  let customerModel: Model<CustomerDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    professionModel = mongoose.model(
      ProfessionEntry.name,
      ProfessionEntrySchema,
    ) as unknown as Model<ProfessionEntryDocument>;
    customerModel = mongoose.model(Customer.name, CustomerSchema) as unknown as Model<CustomerDocument>;
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([professionModel.deleteMany({}), customerModel.deleteMany({})]);
    service = new ProfessionsService(professionModel, customerModel);
  });

  async function makeProfessionalOn(profession: string) {
    return customerModel.create({
      name: 'someone',
      email: `${profession}@example.com`,
      passwordHash: 'x',
      phone: '+966500000000',
      emailVerified: true,
      professional: {
        profession,
        serviceLocation: { type: 'Point', coordinates: [46.6753, 24.7136] },
      },
    });
  }

  describe('seeding', () => {
    it('fills an empty collection with the list we ship', async () => {
      await service.onModuleInit();

      expect(await professionModel.countDocuments()).toBe(PROFESSIONS.length);
      expect(await professionModel.findOne({ slug: 'painter' })).toMatchObject({ label: 'دهّان' });
    });

    // The collection belongs to the dashboard once it exists. Re-seeding on
    // boot would undo an owner's edits — and resurrect a trade they deleted
    // — on every deploy.
    it('leaves an owner-edited list alone on the next boot', async () => {
      await service.onModuleInit();
      await service.update('painter', { label: 'دهّان ومحارة' });
      await professionModel.deleteOne({ slug: 'calligrapher' });

      await service.onModuleInit();

      expect(await professionModel.findOne({ slug: 'painter' })).toMatchObject({ label: 'دهّان ومحارة' });
      expect(await professionModel.findOne({ slug: 'calligrapher' })).toBeNull();
    });
  });

  describe('the registry the rest of the server validates against', () => {
    it('knows a trade added from the dashboard, without a restart', async () => {
      await service.onModuleInit();
      expect(professionRegistry.has('drone_operator')).toBe(false);

      await service.create({ slug: 'drone_operator', label: 'مصوّر بطائرة', group: 'tech' });

      // This is the whole point of the registry: the search DTO and the
      // profile DTO reject anything it doesn't know, so a trade that isn't
      // here the instant it is saved is a trade nobody can pick or search.
      expect(professionRegistry.has('drone_operator')).toBe(true);
      expect(professionRegistry.label('drone_operator')).toBe('مصوّر بطائرة');
    });

    // Switching a trade off must not invalidate the profiles already on it:
    // those people keep a working card and can still edit it. It only stops
    // being offered.
    it('keeps a deactivated trade known but out of the picker', async () => {
      await service.onModuleInit();
      await service.update('calligrapher', { isActive: false });

      expect(professionRegistry.has('calligrapher')).toBe(true);
      expect(professionRegistry.label('calligrapher')).toBe('خطّاط');

      const offered = service.listProfessions().professions.map((p) => p.slug);
      expect(offered).not.toContain('calligrapher');
      expect(offered).toContain('painter');
    });

    it('drops a group heading once every trade under it is off', async () => {
      await service.onModuleInit();
      for (const p of PROFESSIONS.filter((p) => p.group === 'professional')) {
        await service.update(p.slug, { isActive: false });
      }

      expect(service.listProfessions().groups.map((g) => g.slug)).not.toContain('professional');
    });
  });

  describe('editing', () => {
    it('refuses a second trade on the same slug', async () => {
      await service.onModuleInit();

      await expect(service.create({ slug: 'painter', label: 'دهّان ثاني', group: 'finishing' })).rejects.toMatchObject({
        response: { error: 'profession_exists' },
      });
    });

    it('refuses a group that is not one of the picker sections', async () => {
      await service.onModuleInit();

      await expect(
        service.create({ slug: 'astronaut', label: 'رائد فضاء', group: 'space' }),
      ).rejects.toMatchObject({ response: { error: 'group_unknown' } });
    });

    it('drops blank and duplicated aliases rather than storing them', async () => {
      await service.onModuleInit();

      const created = await service.create({
        slug: 'drone_operator',
        label: 'مصوّر بطائرة',
        group: 'tech',
        aliases: ['درون', '  درون  ', '   ', 'تصوير جوي'],
      });

      expect(created.aliases).toEqual(['درون', 'تصوير جوي']);
    });

    // The slug is stored on every profile that offers the trade, so deleting
    // one out from under them would leave those people findable under a name
    // nothing resolves. Deactivating is the reversible answer, and the error
    // carries the count so the dashboard can say so.
    it('refuses to delete a trade people still offer, and says how many', async () => {
      await service.onModuleInit();
      await makeProfessionalOn('painter');

      await expect(service.remove('painter')).rejects.toMatchObject({
        response: { error: 'profession_in_use', professionalCount: 1 },
      });
      expect(await professionModel.findOne({ slug: 'painter' })).not.toBeNull();
    });

    it('deletes one nobody offers', async () => {
      await service.onModuleInit();

      await expect(service.remove('calligrapher')).resolves.toMatchObject({ deleted: true });
      expect(professionRegistry.has('calligrapher')).toBe(false);
    });
  });

  describe('the dashboard list', () => {
    it('counts how many people offer each trade', async () => {
      await service.onModuleInit();
      await makeProfessionalOn('painter');
      await makeProfessionalOn('plumber');

      const { items } = await service.listForOwner();
      const bySlug = new Map(items.map((i) => [i.slug, i]));

      expect(bySlug.get('painter')?.professionalCount).toBe(1);
      expect(bySlug.get('electrician')?.professionalCount).toBe(0);
      expect(bySlug.get('painter')?.groupLabel).toBe('التشطيب والديكور');
    });

    it('includes the deactivated ones, unlike the list the app gets', async () => {
      await service.onModuleInit();
      await service.update('calligrapher', { isActive: false });

      const { items } = await service.listForOwner();

      expect(items.find((i) => i.slug === 'calligrapher')).toMatchObject({ isActive: false });
    });
  });
});
