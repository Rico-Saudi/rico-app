import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiUsage, ApiUsageDocument } from '../owner/schemas/api-usage.schema';

function currentPeriod(): string {
  const d = new Date();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}`;
}

// Calendar-month usage counter for paid external APIs, keyed generically by
// `provider` so any caller that needs to respect the same budget (admin
// sourcing sync, live search fallback, ...) shares one counter instead of
// tracking it independently.
@Injectable()
export class ApiUsageService {
  constructor(@InjectModel(ApiUsage.name) private readonly apiUsageModel: Model<ApiUsageDocument>) {}

  async getUsage(provider: string): Promise<{ period: string; count: number }> {
    const period = currentPeriod();
    const row = await this.apiUsageModel.findOne({ provider, period }).lean();
    return { period, count: row ? row.requestCount : 0 };
  }

  async increment(provider: string, by = 1): Promise<void> {
    const period = currentPeriod();
    await this.apiUsageModel.findOneAndUpdate({ provider, period }, { $inc: { requestCount: by } }, { upsert: true });
  }
}
