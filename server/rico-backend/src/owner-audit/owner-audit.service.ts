import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OwnerAuditLog, OwnerAuditLogDocument } from './schemas/owner-audit-log.schema';

@Injectable()
export class OwnerAuditService {
  constructor(@InjectModel(OwnerAuditLog.name) private readonly auditModel: Model<OwnerAuditLogDocument>) {}

  async record(entry: {
    ownerId: string;
    ownerEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await this.auditModel.create({ ...entry, detail: entry.detail ?? {} });
  }

  async list(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.auditModel
        .find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.auditModel.countDocuments({}),
    ]);
    return { items, total, page, limit };
  }
}
