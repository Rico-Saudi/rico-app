import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { PushSubscription, PushSubscriptionDocument } from './push-subscription.schema';
import { generateVapidKeys, isPushEndpoint, publicKeyFromJwk, VapidKeys, vapidAuthorization } from './vapid';

const SUBJECT = 'https://app.rico-go.com';

/**
 * Wakes a vendor's browser when an order arrives, with the dashboard closed.
 *
 * Before this the dashboard could only notify while one of its tabs was open
 * (it polls every minute); a shop owner who closed the laptop heard about
 * orders by email or not at all.
 *
 * The keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set (base64url
 * of the raw point and the private scalar). Otherwise a pair is generated
 * once and kept in the database, so subscriptions survive restarts without
 * anyone having to make keys by hand.
 */
@Injectable()
export class PushService {
  private keys: Promise<VapidKeys> | null = null;

  constructor(
    @InjectModel(PushSubscription.name) private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async publicKey(): Promise<string> {
    return (await this.vapid()).publicKey;
  }

  async subscribe(accountId: string, endpoint: string): Promise<void> {
    if (!isPushEndpoint(endpoint)) throw new BadRequestException({ error: 'unsupported_push_endpoint' });
    await this.subscriptionModel.updateOne({ endpoint }, { $set: { accountId, endpoint } }, { upsert: true });
  }

  async unsubscribe(accountId: string, endpoint: string): Promise<void> {
    await this.subscriptionModel.deleteOne({ accountId, endpoint });
  }

  /// Pushes to every browser these accounts subscribed. Returns how many
  /// were accepted; dead subscriptions (404/410) are removed. Never throws.
  async wake(accountIds: string[]): Promise<number> {
    if (accountIds.length === 0) return 0;
    try {
      const subs = await this.subscriptionModel.find({ accountId: { $in: accountIds } }, 'endpoint').lean();
      if (subs.length === 0) return 0;
      const keys = await this.vapid();
      let accepted = 0;
      await Promise.all(
        subs.map(async ({ endpoint }) => {
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { Authorization: vapidAuthorization(endpoint, keys, SUBJECT), TTL: '600', Urgency: 'high', 'Content-Length': '0' },
              signal: AbortSignal.timeout(5000),
            });
            if (res.status === 404 || res.status === 410) await this.subscriptionModel.deleteOne({ endpoint });
            else if (res.ok) accepted++;
            else console.warn(`[push] ${new URL(endpoint).host} answered ${res.status}`);
          } catch (e) {
            console.warn('[push] send failed:', (e as Error)?.message || e);
          }
        }),
      );
      return accepted;
    } catch (e) {
      console.error('[push] wake failed:', (e as Error)?.message || e);
      return 0;
    }
  }

  private vapid(): Promise<VapidKeys> {
    this.keys ??= this.loadKeys().catch((e) => {
      this.keys = null;
      throw e;
    });
    return this.keys;
  }

  private async loadKeys(): Promise<VapidKeys> {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      const point = Buffer.from(pub, 'base64url');
      const jwk = {
        kty: 'EC' as const,
        crv: 'P-256' as const,
        x: point.subarray(1, 33).toString('base64url'),
        y: point.subarray(33, 65).toString('base64url'),
        d: priv,
      };
      return { publicKey: publicKeyFromJwk(jwk), privateJwk: jwk };
    }

    const settings = this.connection.collection<{ _id: string; keys: VapidKeys }>('app_settings');
    const stored = await settings.findOne({ _id: 'vapid' });
    if (stored) return stored.keys;
    const fresh = generateVapidKeys();
    // $setOnInsert: two instances booting together agree on whichever wrote first.
    await settings.updateOne({ _id: 'vapid' }, { $setOnInsert: { keys: fresh } }, { upsert: true });
    return (await settings.findOne({ _id: 'vapid' }))!.keys;
  }
}
