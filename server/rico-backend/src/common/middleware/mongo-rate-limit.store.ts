import mongoose from 'mongoose';
import { ClientRateLimitInfo, IncrementResponse, MemoryStore, Options, Store } from 'express-rate-limit';

const COLLECTION = 'rate_limits';

/// The connection Nest's MongooseModule opened, once it's up. Limiters are
/// module-level constants built before Nest exists, so the store finds the
/// connection lazily instead of having it injected.
function liveCollection(): mongoose.mongo.Collection | null {
  const connection = mongoose.connections.find((c) => c.readyState === 1 && c.db);
  return connection ? connection.db!.collection(COLLECTION) : null;
}

let ttlIndexEnsured = false;

/**
 * Hit counters kept in Mongo, so every instance shares them and a deploy
 * doesn't reset them.
 *
 * In memory (the library default) each server process counted alone, and a
 * restart zeroed every count — so the login and OTP limits, the ones that
 * stand between a script and a password, reset with each deploy.
 *
 * When Mongo isn't reachable (or not connected yet, or in unit tests) it
 * counts in memory instead: a limiter that blocks every request because the
 * database hiccuped would take the app down with it.
 */
export class MongoRateLimitStore implements Store {
  private windowMs = 60_000;
  private readonly memory = new MemoryStore();

  constructor(readonly prefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const collection = liveCollection();
    if (!collection) return this.memory.get(key);
    try {
      const doc = await collection.findOne<{ hits: number; resetAt: Date }>({ _id: this.id(key) } as any);
      if (!doc || doc.resetAt.getTime() <= Date.now()) return undefined;
      return { totalHits: doc.hits, resetTime: doc.resetAt };
    } catch {
      return this.memory.get(key);
    }
  }

  async increment(key: string): Promise<IncrementResponse> {
    const collection = liveCollection();
    if (!collection) return this.memory.increment(key);
    try {
      await this.ensureTtlIndex(collection);
      const now = new Date();
      // One atomic step: a window that has ended starts over at 1, otherwise
      // the count goes up — so two instances can't both start a new window.
      const expired = { $lte: [{ $ifNull: ['$resetAt', now] }, now] };
      const doc = await collection.findOneAndUpdate(
        { _id: this.id(key) } as any,
        [
          {
            $set: {
              hits: { $cond: [expired, 1, { $add: ['$hits', 1] }] },
              resetAt: { $cond: [expired, new Date(now.getTime() + this.windowMs), '$resetAt'] },
            },
          },
        ],
        { upsert: true, returnDocument: 'after' },
      );
      return { totalHits: doc!.hits, resetTime: doc!.resetAt };
    } catch {
      return this.memory.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const collection = liveCollection();
    if (!collection) return this.memory.decrement(key);
    await collection.updateOne({ _id: this.id(key), hits: { $gt: 0 } } as any, { $inc: { hits: -1 } }).catch(() => undefined);
  }

  async resetKey(key: string): Promise<void> {
    const collection = liveCollection();
    if (!collection) return this.memory.resetKey(key);
    await collection.deleteOne({ _id: this.id(key) } as any).catch(() => undefined);
  }

  shutdown(): void {
    this.memory.shutdown();
  }

  private id(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /// Rows clean themselves up once their window has passed.
  private async ensureTtlIndex(collection: mongoose.mongo.Collection): Promise<void> {
    if (ttlIndexEnsured) return;
    ttlIndexEnsured = true;
    await collection.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {
      ttlIndexEnsured = false;
    });
  }
}
