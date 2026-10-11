import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CatalogGapDocument = HydratedDocument<CatalogGap>;

// One row per item a customer asked a NAMED shop for and that shop doesn't
// list. Sibling of SearchGap, one level in: SearchGap says "this area wants a
// bakery and Rico has none", CatalogGap says "your customers keep asking YOU
// for أرز بحليب and it isn't on your menu".
//
// Written server-side inside resolveOrder rather than posted by the app: the
// server already knows the business and the misses, so recording there costs
// no round trip and can't be skipped by a client that forgot to call it.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class CatalogGap {
  @Prop({ type: String, required: true, index: true })
  businessId: string;

  /// اسم الصنف كما نطقه العميل — بلا تصحيح، فهو نفسه البيانات المفيدة.
  @Prop({ type: String, required: true })
  requestedItem: string;

  /// أقرب صنف فعلي بقائمة المحل، إن كان فيه شي قريب أصلاً. يفرّق لصاحب
  /// المحل بين "طلبوا شي ما عندك ولا شبهه" و"طلبوا صيغة ثانية لصنف عندك".
  @Prop({ type: String, default: null })
  nearestLabel: string | null;

  @Prop({ type: Number, default: null })
  nearestScore: number | null;
}

export const CatalogGapSchema = SchemaFactory.createForClass(CatalogGap);
