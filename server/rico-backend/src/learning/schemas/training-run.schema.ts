import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TrainingRunDocument = HydratedDocument<TrainingRun>;

/** سجل جولة تدريب: متى صارت، كم فجوة قرأت، وكم اقتراح طلع منها. وجودها
 * يخلّي "آخر تدريب" رقماً بالوحة بدل تخمين، ويخلّي فشل النموذج ظاهراً بدل
 * ما يضيع بسطر سجل على الخادم. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TrainingRun {
  /** 'schedule' or the email of the owner who pressed the button. */
  @Prop({ type: String, required: true })
  triggeredBy: string;

  @Prop({ type: Number, default: 0 })
  gapsConsidered: number;

  @Prop({ type: Number, default: 0 })
  proposalsCreated: number;

  @Prop({ type: Number, default: 0 })
  durationMs: number;

  /** Null on success; the reason on failure. */
  @Prop({ type: String, default: null })
  error: string | null;

  /** The upstream HTTP status behind an `upstream_error`, when there was
   * one. Without it every provider refusal reads the same, and the owner
   * can't tell a daily token cap that clears by itself (429) from a key
   * that has been revoked (401). */
  @Prop({ type: Number, default: null })
  errorStatus: number | null;
}

export const TrainingRunSchema = SchemaFactory.createForClass(TrainingRun);
TrainingRunSchema.index({ createdAt: -1 });
