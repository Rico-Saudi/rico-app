import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OwnerAuditLog, OwnerAuditLogSchema } from './schemas/owner-audit-log.schema';
import { OwnerAuditService } from './owner-audit.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: OwnerAuditLog.name, schema: OwnerAuditLogSchema }])],
  providers: [OwnerAuditService],
  exports: [OwnerAuditService],
})
export class OwnerAuditModule {}
