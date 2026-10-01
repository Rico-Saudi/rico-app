import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { KnowledgeGap, KnowledgeGapDocument } from './schemas/knowledge-gap.schema';
import { Lesson, LessonDocument } from './schemas/lesson.schema';
import { TrainingRun, TrainingRunDocument } from './schemas/training-run.schema';
import { buildTrainingPrompt, GapLine } from './constants/training.prompt';
import { Proposal, validateProposal } from './constants/proposal-validation';
import { LlmService } from '../llm/llm.service';

/** How many gaps one run reads. The prompt already carries the category and
 * profession lists, so this is the part that grows the bill — and thirty
 * most-asked questions is more than an owner will review in one sitting
 * anyway. The rest wait for the next run, still sorted by how often they
 * were asked. */
const MAX_GAPS_PER_RUN = 30;

const MAX_PROPOSALS = 20;

/** Default cadence. Daily is the shortest interval that is still useful:
 * proposals are reviewed by a human, and a queue refilled hourly is a queue
 * nobody empties. `LEARNING_TRAIN_INTERVAL_HOURS=0` switches it off and
 * leaves the dashboard's button as the only way to run one. */
const DEFAULT_INTERVAL_HOURS = 24;

/**
 * الجولة اللي يقرأ فيها ريكو فشله ويقترح كيف يتعلّم منه.
 *
 * تشتغل كل فترة (أو بضغطة من اللوحة)، وكل اللي تنتجه اقتراحات **بانتظار
 * الموافقة** — ما شي منها يوصل مستخدماً قبل ما يوافق المالك. التدريب هنا
 * ليس fine-tune: ريكو يتعلّم بأمثلة تنزرع ببرومبته وبمهن تنضاف لقائمته،
 * فالدرس نافذ خلال ثوانٍ وقابل للتراجع بضغطة، بدل جولة تدريب وإصدار جديد.
 */
@Injectable()
export class TrainingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrainingService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectModel(KnowledgeGap.name) private readonly gapModel: Model<KnowledgeGapDocument>,
    @InjectModel(Lesson.name) private readonly lessonModel: Model<LessonDocument>,
    @InjectModel(TrainingRun.name) private readonly runModel: Model<TrainingRunDocument>,
    private readonly llm: LlmService,
  ) {}

  onModuleInit(): void {
    const hours = Number(process.env.LEARNING_TRAIN_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS);
    if (!Number.isFinite(hours) || hours <= 0 || process.env.NODE_ENV === 'test') return;

    // No run at boot: a deploy loop would then bill a training run per
    // restart. The first one happens an interval from now.
    this.timer = setInterval(() => {
      this.train('schedule').catch((error) => this.logger.warn(`scheduled training failed: ${error}`));
    }, hours * 60 * 60 * 1000);

    // Unreferenced so this timer never holds the process open — a server
    // that won't shut down because a 24-hour timer is pending is a server
    // that fails a deploy.
    this.timer.unref?.();
    this.logger.log(`training scheduled every ${hours}h`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * جولة واحدة. ترجع ملخصها، وتسجّله بجدول الجولات حتى لو فشلت — جولة
   * فاشلة بصمت أسوأ من جولة ظاهرة بسبب فشلها.
   */
  async train(triggeredBy: string) {
    if (this.running) return { skipped: 'already_running' as const };
    this.running = true;
    const startedAt = Date.now();

    let gapsConsidered = 0;
    let proposalsCreated = 0;
    let error: string | null = null;
    let errorStatus: number | null = null;

    try {
      const gaps = await this.gapModel.find({ status: 'open' }).sort({ count: -1, lastSeenAt: -1 }).limit(MAX_GAPS_PER_RUN).lean();
      gapsConsidered = gaps.length;

      if (gaps.length > 0) {
        const lines: GapLine[] = gaps.map((g, index) => ({
          index,
          message: g.message,
          count: g.count,
          dialect: g.dialect ?? 'saudi',
        }));

        const { content } = await this.llm.complete({
          purpose: 'training',
          messages: [{ role: 'system', content: buildTrainingPrompt(lines) }],
          // Nudged above the classifier's 0.2: this is a generation task
          // (naming a trade, writing a reply) rather than a lookup, and a
          // run that proposes the same thing every time is a run that never
          // gets past a proposal the owner already rejected.
          temperature: 0.4,
          maxTokens: 3000,
        });

        proposalsCreated = await this.storeProposals(
          content,
          gaps.map((g) => ({ id: g._id as Types.ObjectId, message: g.message })),
        );
      }
    } catch (e: any) {
      error = String(e?.response?.error ?? e?.message ?? e).slice(0, 300);
      errorStatus = typeof e?.response?.status === 'number' ? e.response.status : null;
      this.logger.warn(`training run failed: ${error}${errorStatus ? ` (upstream ${errorStatus})` : ''}`);
    } finally {
      this.running = false;
    }

    const run = await this.runModel.create({
      triggeredBy,
      gapsConsidered,
      proposalsCreated,
      durationMs: Date.now() - startedAt,
      error,
      errorStatus,
    });

    return run.toObject();
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async storeProposals(content: string, batch: { id: Types.ObjectId; message: string }[]): Promise<number> {
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // A run that produced unparseable text is a failed run, not a silent
      // one — the caller records it against the run row.
      throw new Error('parse_error');
    }

    const raw: Proposal[] = Array.isArray(parsed?.proposals) ? parsed.proposals.slice(0, MAX_PROPOSALS) : [];

    // One gap belongs to one proposal: two lessons fighting over the same
    // question would both close it, and the second approval would then
    // teach something nobody meant to keep.
    const claimed = new Set<number>();
    const docs: Partial<Lesson>[] = [];

    for (const proposal of raw) {
      const indexes = (Array.isArray(proposal?.gaps) ? proposal.gaps : [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i < batch.length && !claimed.has(i));
      if (!indexes.length) continue;

      // The real questions this proposal claims to answer — what an example
      // must actually teach, whatever the model wrote in `message`.
      const doc = validateProposal(proposal, indexes.map((i) => batch[i].message));
      if (!doc) continue;

      indexes.forEach((i) => claimed.add(i));
      docs.push({
        ...doc,
        gapIds: indexes.map((i) => batch[i].id),
        coverage: indexes.length,
        source: 'model',
        status: 'pending',
      });
    }

    if (!docs.length) return 0;

    const created = await this.lessonModel.insertMany(docs, { ordered: false });

    // Marked 'proposed' rather than left open, so the next run spends its
    // budget on questions nobody has answered yet instead of re-proposing
    // what is already sitting in the review queue.
    await Promise.all(
      created.map((lesson) =>
        this.gapModel.updateMany({ _id: { $in: lesson.gapIds } }, { $set: { status: 'proposed', lessonId: lesson._id } }),
      ),
    );

    return created.length;
  }
}
