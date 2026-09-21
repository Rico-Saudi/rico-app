import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LearningService } from './learning.service';
import { TrainingService } from './training.service';
import { ListGapsDto, ListLessonsDto } from './dto/list-gaps.dto';
import { UpdateGapDto } from './dto/update-gap.dto';
import { ApproveLessonDto } from './dto/approve-lesson.dto';
import { SessionGuard } from '../common/guards/session.guard';
import { RequireApp } from '../common/decorators/require-app.decorator';
import { AccountId } from '../common/decorators/account-id.decorator';
import { AccountsService } from '../accounts/accounts.service';
import { OwnerAuditService } from '../owner-audit/owner-audit.service';

/// لوحة "شو ما فهمه ريكو" — للمالك والموظفين، مثل بقية اللوحة.
///
/// منفصلة عن OwnerController لنفس سبب ScrapingController: سطح قائم بذاته
/// له جدوله وجولاته، وحشره بمتحكّم فيه كل شي ثاني يخلّي الملف سجلاً بدل
/// واجهة.
@Controller('owner/learning')
@UseGuards(SessionGuard)
@RequireApp('owner')
export class LearningController {
  constructor(
    private readonly learningService: LearningService,
    private readonly trainingService: TrainingService,
    private readonly accountsService: AccountsService,
    private readonly ownerAuditService: OwnerAuditService,
  ) {}

  @Get('stats')
  stats() {
    return this.learningService.stats();
  }

  @Get('gaps')
  listGaps(@Query() query: ListGapsDto) {
    return this.learningService.listGaps(query);
  }

  @Patch('gaps/:id')
  async updateGap(@Param('id') id: string, @Body() dto: UpdateGapDto, @AccountId() accountId: string) {
    const updated = await this.learningService.setGapStatus(id, dto.status);
    await this.recordAudit(accountId, 'learning.gapStatus', 'KnowledgeGap', id, { status: dto.status });
    return updated;
  }

  @Get('lessons')
  listLessons(@Query() query: ListLessonsDto) {
    return this.learningService.listLessons(query);
  }

  @Post('lessons/:id/approve')
  async approve(@Param('id') id: string, @Body() dto: ApproveLessonDto, @AccountId() accountId: string) {
    const email = await this.emailOf(accountId);
    const lesson = await this.learningService.approve(id, email, dto);
    await this.recordAudit(accountId, 'learning.approve', 'Lesson', id, { kind: lesson.kind, message: lesson.message });
    return lesson;
  }

  @Post('lessons/:id/reject')
  async reject(@Param('id') id: string, @AccountId() accountId: string) {
    const email = await this.emailOf(accountId);
    const lesson = await this.learningService.reject(id, email);
    await this.recordAudit(accountId, 'learning.reject', 'Lesson', id, { message: lesson.message });
    return lesson;
  }

  /// Pulls a lesson back out of the prompt. Separate route from reject so
  /// the audit log distinguishes "never taught" from "unlearned".
  @Post('lessons/:id/retire')
  async retire(@Param('id') id: string, @AccountId() accountId: string) {
    const email = await this.emailOf(accountId);
    const lesson = await this.learningService.retire(id, email);
    await this.recordAudit(accountId, 'learning.retire', 'Lesson', id, { message: lesson.message });
    return lesson;
  }

  @Get('runs')
  listRuns() {
    return this.learningService.listRuns();
  }

  /// A run on demand, for an owner who doesn't want to wait for the
  /// schedule. Concurrency is handled in TrainingService, which returns
  /// `{skipped:'already_running'}` rather than starting a second one.
  @Post('train')
  async train(@AccountId() accountId: string) {
    const email = await this.emailOf(accountId);
    const run = await this.trainingService.train(email);
    await this.recordAudit(accountId, 'learning.train', 'TrainingRun', String((run as any)._id ?? ''), {
      proposalsCreated: (run as any).proposalsCreated ?? 0,
    });
    return run;
  }

  private async emailOf(accountId: string): Promise<string> {
    const { email } = await this.accountsService.me(accountId);
    return email;
  }

  private async recordAudit(
    accountId: string,
    action: string,
    targetType: string,
    targetId: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    const email = await this.emailOf(accountId);
    await this.ownerAuditService.record({ ownerId: accountId, ownerEmail: email, action, targetType, targetId, detail });
  }
}
