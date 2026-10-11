import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type LessonDocument = HydratedDocument<Lesson>;

export const LESSON_KINDS = ['example', 'profession', 'skip'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export const LESSON_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

/** Which prompt a lesson is injected into. 'any' means both. */
export const LESSON_DIALECTS = ['any', 'saudi', 'jordanian'] as const;

/**
 * درس مقترح على فجوة (أو مجموعة فجوات متشابهة)، بانتظار موافقة المالك.
 *
 * ثلاثة أنواع، لأن "ريكو ما فهم" له ثلاثة أسباب مختلفة تماماً:
 * - example: فهم اللغة ناقص — الحل مثال (رسالة ← الناتج الصحيح) ينزرع
 *   بالبرومبت فيصير ريكو يفهم الصياغة ومثيلاتها.
 * - profession: المهنة نفسها مش بالقائمة — الحل صف جديد بجدول المهن،
 *   والموافقة هنا تنشئه فعلياً عبر ProfessionsService.
 * - skip: السؤال خارج نطاق ريكو أصلاً (خبر، ترجمة، رياضيات) — الموافقة
 *   تعني "لا تعرضه عليّ مرة ثانية"، لا إنه اتعلّمه.
 *
 * لا شي من هذا يصير تلقائياً: البرومبت هو صوت ريكو عند كل مستخدم، ومثال
 * غلط بيفسّد التصنيف للكل — فالموافقة يدوية بالقصد.
 */
@Schema({ timestamps: true })
export class Lesson {
  @Prop({ type: String, enum: LESSON_KINDS, required: true })
  kind: LessonKind;

  @Prop({ type: String, enum: LESSON_STATUSES, default: 'pending', index: true })
  status: LessonStatus;

  /** The customer phrasing this lesson teaches. */
  @Prop({ type: String, required: true })
  message: string;

  @Prop({ type: String, enum: LESSON_DIALECTS, default: 'any' })
  dialect: string;

  /** The classifier output this message should produce, already validated by
   * validateIntent — an empty array with a `reply` means "answer, don't
   * search". Stored as loose objects: the intent shape belongs to the
   * classifier, and mirroring it here would mean two places to edit. */
  @Prop({ type: [Object], default: [] })
  intents: Record<string, unknown>[];

  /** For kind='example' with no intents: the off-topic answer to give. */
  @Prop({ type: String, default: null })
  reply: string | null;

  /** For kind='profession': the trade to create, in CreateProfessionDto's shape. */
  @Prop({ type: Object, default: null })
  profession: Record<string, unknown> | null;

  /** لماذا اقترح النموذج هذا — يُعرض للمالك بالعربي ليقرر بلحظة. */
  @Prop({ type: String, default: '' })
  note: string;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'KnowledgeGap', default: [] })
  gapIds: Types.ObjectId[];

  /** How many asks this lesson would answer — the owner's priority signal. */
  @Prop({ type: Number, default: 1 })
  coverage: number;

  /** 'model' for a training run, 'owner' for one written by hand. */
  @Prop({ type: String, default: 'model' })
  source: string;

  @Prop({ type: String, default: null })
  reviewedBy: string | null;

  @Prop({ type: Date, default: null })
  reviewedAt: Date | null;
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);

// What the prompt builder reads on every refresh, and what the panel lists.
LessonSchema.index({ status: 1, kind: 1, createdAt: -1 });
