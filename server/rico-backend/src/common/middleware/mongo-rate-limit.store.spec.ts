import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoRateLimitStore } from './mongo-rate-limit.store';

// The limits that guard logins and codes used to live in each process's
// memory: two instances counted separately and every deploy reset them.
describe('MongoRateLimitStore', () => {
  let mongod: MongoMemoryServer;
  const store = (prefix = 'login', windowMs = 60_000) => {
    const s = new MongoRateLimitStore(prefix);
    s.init({ windowMs } as any);
    return s;
  };

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => mongoose.connection.db!.collection('rate_limits').deleteMany({}));

  it('shares one count between instances', async () => {
    const a = store();
    const b = store();
    await a.increment('1.2.3.4');
    await b.increment('1.2.3.4');
    expect((await a.increment('1.2.3.4')).totalHits).toBe(3);
  });

  it('keeps separate limiters apart', async () => {
    await store('login').increment('ip');
    expect((await store('otp').increment('ip')).totalHits).toBe(1);
  });

  it('starts a fresh window once the old one ends', async () => {
    const s = store('short', 50);
    await s.increment('ip');
    await s.increment('ip');
    await new Promise((r) => setTimeout(r, 80));
    expect((await s.increment('ip')).totalHits).toBe(1);
  });

  it('survives a "restart": a new store instance sees the old count', async () => {
    await store().increment('ip');
    expect((await store().get('ip'))?.totalHits).toBe(1);
  });
});
