import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type KnowledgeGapDocument = HydratedDocument<KnowledgeGap>;

export const GAP_STATUSES = ['open', 'proposed', 'taught', 'ignored'] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

/** How many different phrasings of one question we keep. Enough to show the
 * owner that "بويلر" and "سخان مركزي" are the same ask; not so many that a
 * popular gap grows an unbounded array. */
export const MAX_VARIANTS = 5;

/**
 * سؤال وصل ريكو وما طلعت منه نية مفهومة.
 *
 * صف واحد لكل سؤال بعد التطبيع (normalizeArabic) — تكرار نفس السؤال يزيد
 * count ولا ينشئ صفاً جديداً، لأن اللي يهم المالك هو "شو أكثر إشي بينسأل
 * وريكو ما بيعرفه"، مش سجل كل رسالة.
 *
 * ما ينحفظ هنا ولا معرّف مستخدم ولا موقع ولا سجل محادثة: هذا الجدول للتعلّم
 * من صياغة السؤال، والباقي بيانات ما إلها لزوم بهالشغلة.
 */
@Schema({ timestamps: true })
export class KnowledgeGap {
  /** The de-duplication key — see normalizeArabic. */
  @Prop({ type: String, required: true, unique: true })
  normalized: string;

  /** The most recent raw phrasing, shown to the owner as-is. */
  @Prop({ type: String, required: true })
  message: string;

  /** Distinct raw phrasings, newest first, capped at MAX_VARIANTS. */
  @Prop({ type: [String], default: [] })
  variants: string[];

  /** Brand slugs that asked it — a gap only Jordanian users hit is taught in
   * the Jordanian prompt. */
  @Prop({ type: [String], default: [] })
  brands: string[];

  /** Dialect of the most recent asker, for the same reason. */
  @Prop({ type: String, default: 'saudi' })
  dialect: string;

  @Prop({ type: Number, default: 1 })
  count: number;

  @Prop({ type: Date, default: () => new Date() })
  lastSeenAt: Date;

  /** What Rico said back instead of an answer. Kept so the owner can see
   * whether the clarify reply at least made sense for this question. */
  @Prop({ type: String, default: '' })
  ricoReply: string;

  @Prop({ type: String, enum: GAP_STATUSES, default: 'open', index: true })
  status: GapStatus;

  /** Set once a proposal covering this gap exists. */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Lesson', default: null })
  lessonId: Types.ObjectId | null;
}

export const KnowledgeGapSchema = SchemaFactory.createForClass(KnowledgeGap);

// The panel's default view: open gaps, most-asked first.
KnowledgeGapSchema.index({ status: 1, count: -1, lastSeenAt: -1 });
