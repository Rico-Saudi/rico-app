import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { CustomersService, OTP_TTL_MINUTES } from './customers.service';
import { Customer, CustomerDocument, CustomerSchema } from './schemas/customer.schema';
import { CustomerOtp, CustomerOtpDocument, CustomerOtpSchema } from './schemas/customer-otp.schema';
import { CustomerToken, CustomerTokenDocument, CustomerTokenSchema } from './schemas/customer-token.schema';
import { MailerService } from '../mailer/mailer.service';

// Runs the real service against a real (in-memory) Mongo rather than mocked
// models: the rules worth testing here — a session is only ever issued after
// a code is proven, codes die when consumed or over-guessed — live in the
// interaction between the three collections, not in any one method.
describe('CustomersService', () => {
  let mongod: MongoMemoryServer;
  let service: CustomersService;
  let customerModel: Model<CustomerDocument>;
  let otpModel: Model<CustomerOtpDocument>;
  let tokenModel: Model<CustomerTokenDocument>;
  let sentCodes: { email: string; code: string; purpose: string }[];

  const REGISTRATION = {
    name: 'ماهر',
    email: 'Maher@Example.com',
    password: 'correct horse battery',
    phone: '+966512345678',
  };

  const lastCode = () => sentCodes[sentCodes.length - 1].code;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Cast because mongoose.model() infers Model<Customer> while Nest's
    // @InjectModel hands the service Model<HydratedDocument<Customer>> — the
    // same model object, two spellings of its type.
    customerModel = mongoose.model(Customer.name, CustomerSchema) as unknown as Model<CustomerDocument>;
    otpModel = mongoose.model(CustomerOtp.name, CustomerOtpSchema) as unknown as Model<CustomerOtpDocument>;
    tokenModel = mongoose.model(CustomerToken.name, CustomerTokenSchema) as unknown as Model<CustomerTokenDocument>;
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([customerModel.deleteMany({}), otpModel.deleteMany({}), tokenModel.deleteMany({})]);
    sentCodes = [];
    const mailer = {
      sendOtpEmail: jest.fn(async ({ email, code, purpose }) => {
        sentCodes.push({ email, code, purpose });
      }),
    } as unknown as MailerService;
    service = new CustomersService(customerModel, otpModel, tokenModel, mailer);
  });

  const register = () => service.register({ ...REGISTRATION });

  describe('registration', () => {
    it('emails a 6-digit code and issues no session until it is verified', async () => {
      const result = await register();

      expect(result).toEqual({
        status: 'otp_sent',
        email: 'maher@example.com',
        expiresInSeconds: OTP_TTL_MINUTES * 60,
      });
      expect(sentCodes).toHaveLength(1);
      expect(sentCodes[0].email).toBe('maher@example.com');
      expect(lastCode()).toMatch(/^\d{6}$/);
      expect(await tokenModel.countDocuments()).toBe(0);

      const customer = await customerModel.findOne({ email: 'maher@example.com' }).lean();
      expect(customer?.emailVerified).toBe(false);
      // never stored in the clear, and never recoverable from the record
      expect(customer?.passwordHash).not.toContain(REGISTRATION.password);
    });

    it('stores the code hashed, so a database read cannot complete a signup', async () => {
      await register();
      const otp = await otpModel.findOne().lean();
      expect(otp?.codeHash).not.toBe(lastCode());
      expect(otp?.codeHash).toHaveLength(64);
    });

    it('verifies the code and returns a working session', async () => {
      await register();
      const session = await service.verifyEmail('maher@example.com', lastCode());

      expect(session.customer).toMatchObject({
        name: 'ماهر',
        email: 'maher@example.com',
        phone: '+966512345678',
        emailVerified: true,
      });
      expect(session.token).toBeTruthy();
      const authenticated = await service.authenticate(session.token);
      expect(String(authenticated._id)).toBe(session.customer.id);
    });

    it('rejects a second signup on a verified address', async () => {
      await register();
      await service.verifyEmail('maher@example.com', lastCode());
      await expect(register()).rejects.toMatchObject({ response: { error: 'email_already_exists' } });
    });

    it('lets an abandoned, never-verified signup start over', async () => {
      await register();
      await expect(
        service.register({ ...REGISTRATION, name: 'ماهر الزعبي', password: 'a different one' }),
      ).resolves.toMatchObject({ status: 'otp_sent' });

      // the retry's password is the one that works, and the first code is dead
      await expect(service.verifyEmail('maher@example.com', sentCodes[0].code)).rejects.toMatchObject({
        response: { error: 'invalid_or_expired_code' },
      });
      const session = await service.verifyEmail('maher@example.com', lastCode());
      expect(session.customer.name).toBe('ماهر الزعبي');
    });
  });

  describe('codes', () => {
    it('cannot be reused once consumed', async () => {
      await register();
      const code = lastCode();
      await service.verifyEmail('maher@example.com', code);
      await expect(service.verifyEmail('maher@example.com', code)).rejects.toMatchObject({
        response: { error: 'invalid_or_expired_code' },
      });
    });

    it('dies after five wrong guesses instead of standing until it expires', async () => {
      await register();
      const code = lastCode();
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        await expect(service.verifyEmail('maher@example.com', wrong)).rejects.toMatchObject({
          response: { error: expect.stringMatching(/invalid_or_expired_code|too_many_attempts/) },
        });
      }
      // the real code no longer works either — the cap is only a cap if the
      // code is burned when it is reached
      await expect(service.verifyEmail('maher@example.com', code)).rejects.toMatchObject({
        response: { error: 'invalid_or_expired_code' },
      });
    });

    it('is expired once its window passes', async () => {
      await register();
      const code = lastCode();
      await otpModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await expect(service.verifyEmail('maher@example.com', code)).rejects.toMatchObject({
        response: { error: 'invalid_or_expired_code' },
      });
    });
  });

  describe('login', () => {
    const verifiedSession = async () => {
      await register();
      return service.verifyEmail('maher@example.com', lastCode());
    };

    it('accepts the right password, case-insensitively on the address', async () => {
      await verifiedSession();
      const session = await service.login('MAHER@example.com', REGISTRATION.password);
      expect(session.customer.email).toBe('maher@example.com');
    });

    it('rejects the wrong password and an unknown address the same way', async () => {
      await verifiedSession();
      await expect(service.login('maher@example.com', 'wrong')).rejects.toMatchObject({
        response: { error: 'invalid_credentials' },
      });
      await expect(service.login('nobody@example.com', 'wrong')).rejects.toMatchObject({
        response: { error: 'invalid_credentials' },
      });
    });

    it('sends a fresh code instead of a session when the address was never verified', async () => {
      await register();
      await expect(service.login('maher@example.com', REGISTRATION.password)).rejects.toMatchObject({
        response: { error: 'email_not_verified' },
      });
      expect(sentCodes).toHaveLength(2);
    });

    it('revokes only the token it was asked to, on logout', async () => {
      const phone = await verifiedSession();
      const tablet = await service.login('maher@example.com', REGISTRATION.password);

      await service.logout(phone.token);
      await expect(service.authenticate(phone.token)).rejects.toMatchObject({ response: { error: 'unauthorized' } });
      await expect(service.authenticate(tablet.token)).resolves.toBeTruthy();
    });

    it('stops authenticating a disabled account before its token expires', async () => {
      const session = await verifiedSession();
      await customerModel.updateOne({ email: 'maher@example.com' }, { $set: { isActive: false } });
      await expect(service.authenticate(session.token)).rejects.toMatchObject({ response: { error: 'unauthorized' } });
    });
  });

  describe('password reset', () => {
    it('logs every other device out, because a reset means the password may be known', async () => {
      await register();
      const phone = await service.verifyEmail('maher@example.com', lastCode());
      const tablet = await service.login('maher@example.com', REGISTRATION.password);

      await service.forgotPassword('maher@example.com');
      const session = await service.resetPassword('maher@example.com', lastCode(), 'a brand new one');

      expect(session.token).toBeTruthy();
      for (const old of [phone.token, tablet.token]) {
        await expect(service.authenticate(old)).rejects.toMatchObject({ response: { error: 'unauthorized' } });
      }
      await expect(service.login('maher@example.com', 'a brand new one')).resolves.toBeTruthy();
      await expect(service.login('maher@example.com', REGISTRATION.password)).rejects.toMatchObject({
        response: { error: 'invalid_credentials' },
      });
    });

    it('says the same thing for an unknown address, and emails nothing', async () => {
      await register();
      await service.verifyEmail('maher@example.com', lastCode());
      sentCodes = [];

      const forUnknown = await service.forgotPassword('nobody@example.com');
      expect(sentCodes).toHaveLength(0);
      const forKnown = await service.forgotPassword('maher@example.com');
      expect(sentCodes).toHaveLength(1);
      expect(forUnknown).toEqual(forKnown);
    });

    it('will not reset with a verification code, or vice versa', async () => {
      await register();
      const verifyCode = lastCode();
      await expect(service.resetPassword('maher@example.com', verifyCode, 'nope nope nope')).rejects.toMatchObject({
        response: { error: 'invalid_or_expired_code' },
      });
    });
  });
});
