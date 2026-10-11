import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeGap, KnowledgeGapSchema } from './schemas/knowledge-gap.schema';
import { Lesson, LessonSchema } from './schemas/lesson.schema';
import { TrainingRun, TrainingRunSchema } from './schemas/training-run.schema';
import { LearningService } from './learning.service';
import { TrainingService } from './training.service';
import { LearningController } from './learning.controller';
import { LlmModule } from '../llm/llm.module';
import { AccountsModule } from '../accounts/accounts.module';
import { OwnerAuditModule } from '../owner-audit/owner-audit.module';
import { ProfessionalsModule } from '../professionals/professionals.module';

/**
 * ذاكرة ريكو عن اللي ما فهمه.
 *
 * يصدّر LearningService لأن ClassifyService هو اللي يكتب الفجوة لحظة
 * حدوثها — وهذا الاتجاه الوحيد بين الموديولين: التعلّم ما يستدعي المصنّف
 * أبداً، بس يستعمل نفس قواعد التحقق منه (classify/intent-validation) كملف
 * مستقل عن الخدمة، فما في دورة.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeGap.name, schema: KnowledgeGapSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: TrainingRun.name, schema: TrainingRunSchema },
    ]),
    LlmModule,
    AccountsModule,
    OwnerAuditModule,
    // For ProfessionsService: approving a 'profession' lesson creates the
    // trade in the same collection the dashboard's المهن tab edits.
    ProfessionalsModule,
  ],
  controllers: [LearningController],
  providers: [LearningService, TrainingService],
  exports: [LearningService],
})
export class LearningModule {}
