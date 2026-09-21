import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { KnowledgeGap, KnowledgeGapDocument, MAX_VARIANTS } from './schemas/knowledge-gap.schema';
import { Lesson, LessonDocument } from './schemas/lesson.schema';
import { TrainingRun, TrainingRunDocument } from './schemas/training-run.schema';
import { lessonRegistry, MAX_PROMPT_EXAMPLES } from './constants/lessons.registry';
import { normalizeArabic } from './constants/normalize';
import { ListGapsDto, ListLessonsDto } from './dto/list-gaps.dto';
import { ApproveLessonDto } from './dto/approve-lesson.dto';
import { validateIntent } from '../classify/intent-validation';
import { ProfessionsService } from '../professionals/professions.service';
import { CreateProfessionDto } from '../professionals/dto/upsert-profession.dto';

export interface GapRecord {
  message: string;
  brand: string;
  dialect: string;
  ricoReply: string;
}

/**
 * ذاكرة ريكو عن الأسئلة اللي ما فهمها، واللي اتعلّمه منها.
 *
 * طرفان: `record` يكتب الفجوة لحظة حدوثها (من ClassifyService)، وبقية
 * الدوال تخدم لوحة المالك. بينهما TrainingService، اللي يقرأ الفجوات
 * ويقترح دروساً — وما شي من اقتراحاته يدخل البرومبت قبل ما يوافق المالك هنا.
 */
@Injectable()
export class LearningService implements OnModuleInit {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    @InjectModel(KnowledgeGap.name) private readonly gapModel: Model<KnowledgeGapDocument>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<LessonDocument>,
    @InjectModel(TrainingRun.name) private readonly runModel: Model<TrainingRunDocument>,
    private readonly professionsService: ProfessionsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.refresh();
    } catch (error) {
      // Same bargain as ProfessionsService: an unreachable database must not
      // stop the server coming up. Rico then answers exactly as it did
      // before anyone taught it anything, which is a working assistant.
      this.logger.warn(`lessons not loaded, the classifier runs untaught: ${error}`);
    }
  }

  /** Reloads the approved examples into the in-process registry, which is
   * what the classifier prompt reads. Called after every write here. */
  async refresh(): Promise<void> {
    const rows = await this.lessonModel
      .find({ status: 'approved', kind: 'example' })
      .sort({ createdAt: -1 })
      .limit(MAX_PROMPT_EXAMPLES)
      .lean();

    lessonRegistry.replaceAll(
      rows.map((r) => ({
        message: r.message,
        dialect: r.dialect ?? 'any',
        intents: (r.intents ?? []) as Record<string, unknown>[],
        reply: r.reply ?? null,
      })),
    );
  }

  // ─── What the classifier writes ──────────────────────────────────────────

  /**
   * يسجّل سؤالاً ما طلعت منه نية مفهومة.
   *
   * الفشل هنا لا يُرمى: المستخدم مستني رده، وضياع سطر من سجل التعلّم أهون
   * بكثير من تحويل رد ناجح إلى خطأ لأن كتابة إحصائية تعثّرت.
   */
  async record(entry: GapRecord): Promise<void> {
    const normalized = normalizeArabic(entry.message);
    // A message that normalizes to nothing (emoji only, punctuation only)
    // teaches nobody anything and would collide on the empty-string key.
    if (!normalized) return;

    const message = entry.message.trim().slice(0, 300);

    try {
      await this.gapModel.updateOne(
        { normalized },
        {
          $set: { message, lastSeenAt: new Date(), dialect: entry.dialect, ricoReply: entry.ricoReply.slice(0, 300) },
          $inc: { count: 1 },
          $addToSet: { brands: entry.brand },
          // $position + $slice keeps the newest phrasings and drops the
          // rest, so a gap asked ten thousand times stays a fixed-size
          // document. It can hold the same phrasing twice (Mongo has no
          // capped $addToSet); listGaps dedupes on the way out, which is
          // cheaper than the read this would otherwise need on the hot path.
          $push: { variants: { $each: [message], $position: 0, $slice: MAX_VARIANTS } },
          $setOnInsert: { normalized, status: 'open' },
        },
        { upsert: true },
      );
    } catch (error) {
      this.logger.warn(`knowledge gap not recorded: ${error}`);
    }
  }

  // ─── What the dashboard reads ────────────────────────────────────────────

  async listGaps(query: ListGapsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;

    const filter: FilterQuery<KnowledgeGapDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.q?.trim()) {
      // Matched against the normalized text as well as the raw one, so a
      // search for "بويلر" finds "البويلرات؟" too.
      const needle = query.q.trim();
      filter.$or = [
        { message: { $regex: escapeRegex(needle), $options: 'i' } },
        { normalized: { $regex: escapeRegex(normalizeArabic(needle)), $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.gapModel
        .find(filter)
        .sort({ count: -1, lastSeenAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.gapModel.countDocuments(filter),
    ]);

    return {
      items: items.map((g) => ({ ...g, variants: [...new Set(g.variants ?? [])] })),
      total,
      page,
      limit,
    };
  }

  /** The three numbers the panel leads with, plus when Rico last trained. */
  async stats() {
    const [byStatus, pendingLessons, approvedExamples, lastRun] = await Promise.all([
      this.gapModel.aggregate<{ _id: string; count: number; asks: number }>([
        { $group: { _id: '$status', count: { $sum: 1 }, asks: { $sum: '$count' } } },
      ]),
      this.lessonModel.countDocuments({ status: 'pending' }),
      this.lessonModel.countDocuments({ status: 'approved', kind: 'example' }),
      this.runModel.findOne().sort({ createdAt: -1 }).lean(),
    ]);

    const gaps = Object.fromEntries(byStatus.map((s) => [s._id, { rows: s.count, asks: s.asks }]));
    return {
      gaps,
      openAsks: gaps.open?.asks ?? 0,
      pendingLessons,
      approvedExamples,
      promptCapacity: MAX_PROMPT_EXAMPLES,
      lastRun,
    };
  }

  listLessons(query: ListLessonsDto) {
    const filter = query.status ? { status: query.status } : {};
    return this.lessonModel
      .find(filter)
      .sort({ status: 1, coverage: -1, createdAt: -1 })
      .limit(query.limit ?? 50)
      .lean();
  }

  listRuns(limit = 10) {
    return this.runModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }

  // ─── What the dashboard writes ───────────────────────────────────────────

  async setGapStatus(id: string, status: string) {
    const updated = await this.gapModel.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    if (!updated) throw new NotFoundException({ error: 'gap_not_found' });
    return updated;
  }

  /**
   * يعتمد الدرس فيصير نافذاً فوراً.
   *
   * كل نوع له أثر مختلف: `example` ينزرع بالبرومبت، `profession` ينشئ مهنة
   * حقيقية بجدول المهن، و`skip` يعني "هذا خارج نطاقنا، لا تعرضه عليّ ثاني".
   * وبالحالات الثلاث تنغلق الفجوات المرتبطة فيه حتى ما تظل تتكرر بالطابور.
   */
  async approve(id: string, reviewer: string, edits: ApproveLessonDto) {
    const lesson = await this.lessonModel.findById(id);
    if (!lesson) throw new NotFoundException({ error: 'lesson_not_found' });
    if (lesson.status !== 'pending') throw new BadRequestException({ error: 'lesson_already_reviewed' });

    if (edits.message) lesson.message = edits.message.trim();
    if (edits.dialect) lesson.dialect = edits.dialect;
    if (edits.reply !== undefined) lesson.reply = edits.reply.trim() || null;
    if (edits.intents) lesson.intents = this.validateIntents(edits.intents);

    if (lesson.kind === 'example') {
      // An approved example is a promise about what the classifier will
      // return, so it goes through the same gate a live answer does. A
      // lesson that validates to nothing would teach the model a shape the
      // server then throws away.
      const intents = this.validateIntents(lesson.intents);
      if (!intents.length && !lesson.reply) {
        throw new BadRequestException({ error: 'lesson_teaches_nothing' });
      }
      lesson.intents = intents;
    }

    if (lesson.kind === 'profession') {
      await this.createProposedProfession(lesson);
    }

    lesson.status = 'approved';
    lesson.reviewedBy = reviewer;
    lesson.reviewedAt = new Date();
    await lesson.save();

    await this.closeGaps(lesson.gapIds, lesson.kind === 'skip' ? 'ignored' : 'taught');
    await this.refresh();

    return lesson.toObject();
  }

  async reject(id: string, reviewer: string) {
    const lesson = await this.lessonModel.findById(id);
    if (!lesson) throw new NotFoundException({ error: 'lesson_not_found' });
    if (lesson.status !== 'pending') throw new BadRequestException({ error: 'lesson_already_reviewed' });

    lesson.status = 'rejected';
    lesson.reviewedBy = reviewer;
    lesson.reviewedAt = new Date();
    await lesson.save();

    // Back to 'open', not 'ignored': the proposal was wrong, the question
    // was real, and the next run should get another go at it.
    await this.closeGaps(lesson.gapIds, 'open');
    return lesson.toObject();
  }

  /** Retires a lesson already in the prompt. Kept separate from reject so
   * the two reads differently in the audit log: one is "never taught", the
   * other is "taught, then unlearned". */
  async retire(id: string, reviewer: string) {
    const lesson = await this.lessonModel.findById(id);
    if (!lesson) throw new NotFoundException({ error: 'lesson_not_found' });

    lesson.status = 'rejected';
    lesson.reviewedBy = reviewer;
    lesson.reviewedAt = new Date();
    await lesson.save();

    await this.refresh();
    return lesson.toObject();
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private validateIntents(raw: unknown[]): Record<string, unknown>[] {
    return (raw ?? []).map((i) => validateIntent(i)).filter(Boolean) as unknown as Record<string, unknown>[];
  }

  private async createProposedProfession(lesson: LessonDocument): Promise<void> {
    const proposed = lesson.profession as Partial<CreateProfessionDto> | null;
    if (!proposed?.slug || !proposed.label || !proposed.group) {
      throw new BadRequestException({ error: 'profession_proposal_incomplete' });
    }
    try {
      await this.professionsService.create({
        slug: proposed.slug,
        label: proposed.label,
        group: proposed.group,
        aliases: proposed.aliases ?? [],
      });
    } catch (error: any) {
      // Someone adding the trade by hand between the proposal and the
      // approval is a success, not a conflict — the gap is covered either
      // way, so the approval carries on.
      if (error?.response?.error !== 'profession_exists') throw error;
    }
  }

  private async closeGaps(gapIds: Types.ObjectId[], status: string): Promise<void> {
    if (!gapIds?.length) return;
    await this.gapModel.updateMany({ _id: { $in: gapIds } }, { $set: { status } });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
