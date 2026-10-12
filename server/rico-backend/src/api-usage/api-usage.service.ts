import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiUsage, ApiUsageDocument } from '../owner/schemas/api-usage.schema';

function currentPeriod(): string {
  const d = new Date();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}`;
}

/// 'YYYY-MM-DD' (UTC) — for budgets that reset daily rather than monthly
/// (the LLM spend cap). Shares the `period` field with the monthly rows; the
/// two never collide because each provider uses one granularity only.
export function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

// Calendar-month usage counter for paid external APIs, keyed generically by
// `provider` so any caller that needs to respect the same budget (admin
// sourcing sync, live search fallback, ...) shares one counter instead of
// tracking it independently.
@Injectable()
export class ApiUsageService {
  constructor(@InjectModel(ApiUsage.name) private readonly apiUsageModel: Model<ApiUsageDocument>) {}

  async getUsage(provider: string, period = currentPeriod()): Promise<{ period: string; count: number }> {
    const row = await this.apiUsageModel.findOne({ provider, period }).lean();
    return { period, count: row ? row.requestCount : 0 };
  }

  async increment(provider: string, by = 1, period = currentPeriod()): Promise<void> {
    await this.apiUsageModel.findOneAndUpdate({ provider, period }, { $inc: { requestCount: by } }, { upsert: true });
  }

  /// Reserves `by` units of the budget in one atomic step, or reports that
  /// the cap is reached. Read-then-increment let a burst of concurrent
  /// callers all see "under the cap" and all spend; here the cap is part of
  /// the update's filter, so only the calls that fit get through.
  ///
  /// When the row exists but is full, the filter matches nothing and the
  /// upsert tries to insert a second row for the same (provider, period) —
  /// the unique index rejects it (E11000), which is the "cap reached" answer.
  ///
  /// The one other way to hit E11000 is two callers racing to create the
  /// period's first row; the loser retries once, by which time the row exists
  /// and the second attempt is a plain conditional update.
  async tryConsume(provider: string, cap: number, by = 1, period = currentPeriod()): Promise<boolean> {
    if (by > cap) return false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.apiUsageModel.findOneAndUpdate(
          { provider, period, requestCount: { $lte: cap - by } },
          { $inc: { requestCount: by } },
          { upsert: true },
        );
        return true;
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
      }
    }
    return false;
  }
}
