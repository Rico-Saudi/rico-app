import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalRequest, ProfessionalRequestDocument, ProfessionalRequestSchema } from './schemas/professional-request.schema';
import { ProfessionalFile, ProfessionalFileDocument, ProfessionalFileSchema } from './schemas/professional-file.schema';
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
  let fileModel: Model<ProfessionalFileDocument>;
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
    fileModel = mongoose.model(ProfessionalFile.name, ProfessionalFileSchema) as unknown as Model<ProfessionalFileDocument>;

    // $geoNear needs the 2dsphere index to exist, and mongoose only builds it
    // on connect for models registered before that point.
    await customerModel.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([customerModel.deleteMany({}), requestModel.deleteMany({}), fileModel.deleteMany({})]);
    sentEmails = [];
    const mailer = {
      sendProfessionalRequestEmail: jest.fn(async ({ to, customerPhone }) => {
        sentEmails.push({ to, customerPhone });
      }),
    } as unknown as MailerService;
    service = new ProfessionalsService(customerModel, requestModel, fileModel, mailer);
  });

  describe('search', () => {
    it('returns the nearest professional of that trade first', async () => {
      await makeProfessional({ name: 'far', km: 8 });
      await makeProfessional({ name: 'near', km: 2 });

      const { professionals } = await search();

      expect(professionals.map((p) => p.name)).toEqual(['near', 'far']);
      expect(professionals[0].distanceMeters).toBeLessThan(professionals[1].distanceMeters);
    });

    // Asserted as an exact key set, not a couple of `not.toHaveProperty`
    // checks: the card keeps growing, and the point is that adding a field
    // to it has to be a deliberate edit here rather than something that
    // quietly carries a phone number out with it.
    it('never exposes a phone number or email', async () => {
      await makeProfessional({ name: 'someone' });

      const { professionals } = await search();

      expect(professionals).toHaveLength(1);
      expect(Object.keys(professionals[0]).sort()).toEqual(
        [
          'bio',
          'cardAccent',
          'cvContentType',
          'cvFileName',
          'cvUrl',
          'distanceMeters',
          'headline',
          'id',
          'name',
          'photoUrl',
          'profession',
          'professionLabel',
          'serviceRadiusMeters',
          'skills',
          'yearsExperience',
        ].sort(),
      );
    });

    it('carries the business card the professional filled in', async () => {
      const someone = await makeProfessional({ name: 'painter' });
      await customerModel.updateOne(
        { _id: someone._id },
        {
          $set: {
            'professional.bio': 'أشتغل دهانات داخلية من ٢٠١٠',
            'professional.skills': ['دهانات داخلية', 'ورق جدران'],
            'professional.yearsExperience': 14,
            'professional.cardAccent': 'gold',
          },
        },
      );

      const { professionals } = await search();

      expect(professionals[0]).toMatchObject({
        bio: 'أشتغل دهانات داخلية من ٢٠١٠',
        skills: ['دهانات داخلية', 'ورق جدران'],
        yearsExperience: 14,
        cardAccent: 'gold',
      });
    });

    // A profile saved before the card existed has none of these fields in
    // Mongo at all. The app renders whatever it is handed, so the gap has to
    // close here rather than as a null dereference on a phone.
    it('fills the card in with defaults for a profile saved before it existed', async () => {
      const oldTimer = await makeProfessional({ name: 'old timer' });
      // Unset rather than left to the schema defaults: a row written before
      // these fields existed genuinely has no such keys, which is the case
      // the projection's `?? null` is there for.
      await customerModel.collection.updateOne(
        { _id: oldTimer._id },
        {
          $unset: {
            'professional.photoUrl': '',
            'professional.bio': '',
            'professional.skills': '',
            'professional.yearsExperience': '',
            'professional.cardAccent': '',
            'professional.cvUrl': '',
          },
        },
      );

      const { professionals } = await search();

      expect(professionals[0]).toMatchObject({
        bio: null,
        skills: [],
        yearsExperience: null,
        cardAccent: 'green',
        cvUrl: null,
        photoUrl: null,
      });
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
  describe('the CV on the card', () => {
    function upload(name: string, mimetype = 'application/pdf', bytes = 1024) {
      return {
        buffer: Buffer.alloc(bytes, 1),
        mimetype,
        size: bytes,
        originalname: name,
      } as Express.Multer.File;
    }

    it('attaches a CV and points the card at it', async () => {
      const painter = await makeProfessional({ name: 'painter' });

      const updated = await service.setCv(painter, upload('cv.pdf'));

      expect(updated.professional?.cvUrl).toMatch(/^\/professionals\/file\/[a-f0-9]{32}$/);
      expect(updated.professional?.cvFileName).toBe('cv.pdf');
      expect(updated.professional?.cvContentType).toBe('application/pdf');
      expect(await fileModel.countDocuments({ customerId: painter._id, kind: 'cv' })).toBe(1);
    });

    // The URL is public, so it must not be something anyone can count their
    // way to: a CV carries a real name and address.
    it('keys the URL by an unguessable token, not the document id', async () => {
      const painter = await makeProfessional({ name: 'painter' });
      const updated = await service.setCv(painter, upload('cv.pdf'));

      const document = await fileModel.findOne({ customerId: painter._id, kind: 'cv' });
      expect(updated.professional?.cvUrl).not.toContain(String(document!._id));
      expect(updated.professional?.cvUrl).toContain(document!.token);

      await expect(service.findFile(String(document!._id))).rejects.toMatchObject({
        response: { error: 'file_not_found' },
      });
      await expect(service.findFile(document!.token)).resolves.toMatchObject({ fileName: 'cv.pdf' });
    });

    it('drops the old bytes when a CV is replaced', async () => {
      const painter = await makeProfessional({ name: 'painter' });
      const first = await service.setCv(painter, upload('old.pdf'));
      const firstUrl = first.professional?.cvUrl;

      const second = await service.setCv(painter, upload('new.pdf'));

      expect(await fileModel.countDocuments({ customerId: painter._id, kind: 'cv' })).toBe(1);
      expect(second.professional?.cvUrl).not.toBe(firstUrl);
      expect(second.professional?.cvFileName).toBe('new.pdf');
    });

    it('accepts a photo of a paper CV, and refuses anything else', async () => {
      const painter = await makeProfessional({ name: 'painter' });

      await expect(service.setCv(painter, upload('cv.jpg', 'image/jpeg'))).resolves.toBeDefined();
      await expect(service.setCv(painter, upload('cv.exe', 'application/x-msdownload'))).rejects.toMatchObject({
        response: { error: 'unsupported_cv_type' },
      });
    });

    // The name comes off a device and ends up in a Content-Disposition
    // header, so it is rebuilt rather than trusted.
    it('strips a path and control characters out of the filename', async () => {
      const painter = await makeProfessional({ name: 'painter' });

      const updated = await service.setCv(painter, upload('../../etc/pa"ss\nwd.pdf'));

      expect(updated.professional?.cvFileName).toBe('passwd.pdf');
    });

    it('falls back to a generic name when nothing usable is left', async () => {
      const painter = await makeProfessional({ name: 'painter' });

      const updated = await service.setCv(painter, upload('///', 'image/jpeg'));

      expect(updated.professional?.cvFileName).toBe('cv.jpg');
    });

    it('refuses a CV from someone with no trade to hang it on', async () => {
      const plain = await customerModel.create({
        name: 'plain',
        email: 'plain@example.com',
        passwordHash: 'x',
        phone: '+966500000000',
        emailVerified: true,
      });

      await expect(service.setCv(plain, upload('cv.pdf'))).rejects.toMatchObject({
        response: { error: 'professional_profile_required' },
      });
    });

    it('puts the face of the professional on the card', async () => {
      const painter = await makeProfessional({ name: 'painter' });

      const updated = await service.setPhoto(painter, upload('me.jpg', 'image/jpeg'));

      expect(updated.professional?.photoUrl).toMatch(/^\/professionals\/file\/[a-f0-9]{32}$/);
      expect(await fileModel.countDocuments({ customerId: painter._id, kind: 'photo' })).toBe(1);
    });

    it('refuses a PDF as a face', async () => {
      const painter = await makeProfessional({ name: 'painter' });

      await expect(service.setPhoto(painter, upload('cv.pdf'))).rejects.toMatchObject({
        response: { error: 'unsupported_photo_type' },
      });
    });

    // The two files live in one collection, so the replace-the-previous-one
    // sweep has to be scoped by kind — otherwise changing your photo would
    // silently take your CV down with it.
    it('keeps the photo and the CV independent of each other', async () => {
      const created = await makeProfessional({ name: 'painter' });
      const withCv = await service.setCv(created, upload('cv.pdf'));
      const withPhoto = await service.setPhoto(withCv, upload('me.jpg', 'image/jpeg'));
      const cvUrl = withPhoto.professional?.cvUrl;
      expect(cvUrl).toBeTruthy();

      // Replacing the photo must leave the CV attached...
      const rephotographed = await service.setPhoto(withPhoto, upload('me2.jpg', 'image/jpeg'));
      expect(rephotographed.professional?.cvUrl).toBe(cvUrl);

      // ...and detaching it must too.
      const faceless = await service.removePhoto(rephotographed);
      expect(faceless.professional?.photoUrl).toBeNull();
      expect(faceless.professional?.cvUrl).toBe(cvUrl);
      expect(await fileModel.countDocuments({ customerId: created._id })).toBe(1);
    });

    it('detaches the CV and leaves the rest of the card alone', async () => {
      const painter = await makeProfessional({ name: 'painter' });
      await customerModel.updateOne({ _id: painter._id }, { $set: { 'professional.bio': 'عن شغلي' } });
      const withCv = await service.setCv(await customerModel.findById(painter._id).then((c) => c!), upload('cv.pdf'));

      const cleared = await service.removeCv(withCv);

      expect(cleared.professional?.cvUrl).toBeNull();
      expect(cleared.professional?.cvFileName).toBeNull();
      expect(cleared.professional?.bio).toBe('عن شغلي');
      expect(await fileModel.countDocuments({ customerId: painter._id, kind: 'cv' })).toBe(0);
    });
  });
});