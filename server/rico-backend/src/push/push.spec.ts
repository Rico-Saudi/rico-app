import { createPublicKey, verify } from 'crypto';
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateVapidKeys, isPushEndpoint, vapidAuthorization } from './vapid';
import { PushService } from './push.service';
import { PushSubscription, PushSubscriptionDocument, PushSubscriptionSchema } from './push-subscription.schema';

describe('VAPID', () => {
  it('signs a JWT the push service can verify with the public key', () => {
    const keys = generateVapidKeys();
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://app.rico-go.com');
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);

    const [h, c, sig] = jwt.split('.');
    const point = Buffer.from(keys.publicKey, 'base64url');
    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
      format: 'jwk',
    });
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({ aud: 'https://fcm.googleapis.com' });
  });

  it('only accepts real push services as endpoints', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isPushEndpoint('https://evilfcm.googleapis.com.attacker.io/x')).toBe(false);
  });
});

describe('PushService', () => {
  let mongod: MongoMemoryServer;
  let model: Model<PushSubscriptionDocument>;
  const realFetch = global.fetch;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    model = mongoose.model(PushSubscription.name, PushSubscriptionSchema) as unknown as Model<PushSubscriptionDocument>;
    await model.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    global.fetch = realFetch;
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => model.deleteMany({}));

  it('keeps one key pair across restarts', async () => {
    const first = await new PushService(model, mongoose.connection).publicKey();
    const second = await new PushService(model, mongoose.connection).publicKey();
    expect(second).toBe(first);
  });

  it('wakes the subscribed browsers and forgets the ones that are gone', async () => {
    const account = new mongoose.Types.ObjectId().toString();
    const service = new PushService(model, mongoose.connection);
    await service.subscribe(account, 'https://fcm.googleapis.com/fcm/send/live');
    await service.subscribe(account, 'https://fcm.googleapis.com/fcm/send/gone');

    const calls: { url: string; headers: Record<string, string> }[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), headers: init.headers });
      return { ok: !String(url).endsWith('gone'), status: String(url).endsWith('gone') ? 410 : 201 } as Response;
    }) as any;

    expect(await service.wake([account])).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].headers.Authorization).toMatch(/^vapid t=.+, k=.+/);
    expect(await model.countDocuments({})).toBe(1);
  });

  it('refuses an endpoint that is not a push service', async () => {
    const service = new PushService(model, mongoose.connection);
    await expect(service.subscribe(new mongoose.Types.ObjectId().toString(), 'https://internal.example/x')).rejects.toMatchObject({
      response: { error: 'unsupported_push_endpoint' },
    });
  });
});
