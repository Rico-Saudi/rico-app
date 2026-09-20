import { LlmService } from '../llm/llm.service';
import { MAX_CAPTION_CHARS } from './instagram.constants';

/// Turns an Instagram caption into an offer, or decides it isn't one.
///
/// Most of a shop's posts are not offers — they're a new arrival, a photo of
/// the interior, Eid greetings, a hiring notice. The model's first job is to
/// say "no" to those, and the prompt spends most of its length on that,
/// because a feed turned indiscriminately into deals is worse than an empty
/// one: the user stops trusting the word.

export interface ParsedOffer {
  titleAr: string;
  descriptionAr: string | null;
  dealType: 'percent' | 'fixed' | 'bogo' | 'free_item' | 'bundle';
  value: number | null;
  promoCode: string | null;
  /// ISO date the caption itself names as the end, or null when it names none.
  endsAt: string | null;
}

const PROMPT = `أنت تقرأ منشورات إنستغرام لمحلات تجارية في السعودية والأردن، ومهمتك واحدة فقط: تحدّد هل هذا المنشور **عرض أو خصم فعلي** أم لا، وإذا كان عرضاً تستخرج تفاصيله كما ذُكرت حرفياً.

أغلب المنشورات ليست عروضاً. منتج جديد بلا خصم، صورة للمحل، تهنئة بعيد، إعلان توظيف، شكر للزبائن، أو وصف لخدمة — كل هذي ليست عروضاً، وردّك عليها {"isOffer": false}.

اعتبره عرضاً فقط إذا ذكر المنشور صراحة تخفيضاً أو مجانية أو سعراً مخفّضاً:
- نسبة خصم ("خصم ٣٠٪") → dealType="percent"، value=30
- سعر ثابت مخفّض ("بـ١٩ ريال بدل ٣٥") → dealType="fixed"، value=19
- اشترِ واحصل ("اشتر واحدة والثانية مجاناً") → dealType="bogo"، value=null
- صنف مجاني مع الشراء ("قهوة مجانية مع أي وجبة") → dealType="free_item"، value=null
- باقة بسعر ("عرض العائلة بـ٩٩") → dealType="bundle"، value=99

قواعد صارمة:
- لا تخترع رقماً غير مذكور. إذا قال "خصومات كبيرة" بلا نسبة، فـvalue=null وdealType حسب أقرب نوع.
- titleAr: جملة قصيرة جداً (أقل من ٦٠ حرفاً) تصف العرض، مأخوذة من المنشور لا من خيالك.
- promoCode: فقط إذا ذُكر كود صراحة، وإلا null.
- endsAt: فقط إذا ذُكر تاريخ أو مدة انتهاء صريحة، بصيغة YYYY-MM-DD، وإلا null.
- إذا كان المنشور بلغة غير العربية، استخرج التفاصيل واكتب titleAr بالعربية.

أعد JSON فقط بهذا الشكل بالضبط:
{"isOffer": true|false, "titleAr": "..."|null, "descriptionAr": "..."|null, "dealType": "percent"|"fixed"|"bogo"|"free_item"|"bundle"|null, "value": number|null, "promoCode": "..."|null, "endsAt": "YYYY-MM-DD"|null}`;

const DEAL_TYPES = ['percent', 'fixed', 'bogo', 'free_item', 'bundle'];

/// Validates what came back, dropping anything unusable rather than trusting
/// it. Same philosophy as ClassifyService.validateIntent: a malformed field is
/// discarded, not repaired by guesswork.
export function validateParsed(raw: any): ParsedOffer | null {
  if (!raw || raw.isOffer !== true) return null;

  const titleAr = typeof raw.titleAr === 'string' ? raw.titleAr.trim() : '';
  if (!titleAr || titleAr.length > 120) return null;

  const dealType = DEAL_TYPES.includes(raw.dealType) ? raw.dealType : null;
  if (!dealType) return null;

  // A percentage outside 1-99 is a misread, not a discount.
  const rawValue = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;
  const value =
    rawValue === null ? null : dealType === 'percent' ? (rawValue > 0 && rawValue < 100 ? rawValue : null) : rawValue > 0 ? rawValue : null;

  const promoCode = typeof raw.promoCode === 'string' && raw.promoCode.trim().length <= 40 ? raw.promoCode.trim() : null;

  let endsAt: string | null = null;
  if (typeof raw.endsAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.endsAt)) {
    const parsed = new Date(raw.endsAt);
    // A date already past means the model read a start date, or last year's
    // post. Either way it is not an expiry we should honour.
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) endsAt = raw.endsAt;
  }

  return {
    titleAr,
    descriptionAr: typeof raw.descriptionAr === 'string' ? raw.descriptionAr.trim().slice(0, 400) || null : null,
    dealType,
    value,
    promoCode,
    endsAt,
  };
}

export async function parseCaption(llm: LlmService, caption: string): Promise<ParsedOffer | null> {
  const trimmed = caption.trim().slice(0, MAX_CAPTION_CHARS);
  if (trimmed.length < 8) return null;

  try {
    const { content } = await llm.complete({
      purpose: 'classify',
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: trimmed },
      ],
      // Near-deterministic: this is extraction, not writing. The same caption
      // should not become a different offer on a second import.
      temperature: 0,
      maxTokens: 300,
    });
    return validateParsed(JSON.parse(content));
  } catch {
    // One unreadable caption should not fail the whole import.
    return null;
  }
}
