import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { brandFor, DEFAULT_BRAND } from '../common/constants/brands';
import { buildSystemPrompt, clarifyReplyFor, MAX_INTENTS } from './constants/classify.constants';
import { buildVoiceBlock, validateMood } from './constants/moods';
import { ClassifyRequestDto, LastResultsDto } from './dto/classify-request.dto';
import { validateIntent } from './intent-validation';
import { LearningService } from '../learning/learning.service';

// Strips characters that could break out of the plain-text block we
// interpolate into the system prompt — item names are third-party-controlled
// (OSM/business data), not something we authored.
function sanitizeForPrompt(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').slice(0, 120);
}

function buildLastResultsBlock(lastResults: LastResultsDto): string {
  const label = sanitizeForPrompt(lastResults.label);
  const lines = lastResults.items.map((i) => `${i.position}. ${sanitizeForPrompt(i.name)}`).join('\n');
  return `\n\nآخر نتائج عُرضت على المستخدم (الفئة: ${label}):\n${lines}\nإذا أشار المستخدم لأحد هذه العناصر بالترتيب (الأول/الثاني/...)، ضع رقم الترتيب في referencedPosition واجعل brandHint=null. إذا طلب شيئاً "شبيه/مثله" بدون رقم محدد، استخدم فئة هذه القائمة (${label}) دون تحديد referencedPosition أو brandHint.`;
}

// Exposed for tests only: validateIntent is where a malformed model response
// gets turned into something safe, and that deserves direct coverage rather
// than being reachable only through a live Groq call.
export const validateIntentForTest = validateIntent;

@Injectable()
export class ClassifyService {
  constructor(
    private readonly llm: LlmService,
    private readonly learning: LearningService,
  ) {}

  async classify(dto: ClassifyRequestDto) {
    // A second mid-conversation system-role message isn't something
    // Llama-family chat templates are trained on (system is reserved for
    // position 0), so "last shown results" context is appended to the one
    // system turn instead of injected as its own message.
    const prompt = buildSystemPrompt(brandFor(dto.brand));
    const withResults = dto.lastResults ? `${prompt}${buildLastResultsBlock(dto.lastResults)}` : prompt;
    // Prosody notes go last so they sit closest to the message they
    // describe, and only for voice — see buildVoiceBlock.
    const systemContent = dto.voice ? `${withResults}${buildVoiceBlock(dto.voice)}` : withResults;

    const { content } = await this.llm.complete({
      purpose: 'classify',
      messages: [{ role: 'system', content: systemContent }, ...(dto.history || []), { role: 'user', content: dto.message }],
      // Was 0 (fully deterministic) — bumped slightly so the `reply` field
      // (small talk/off-topic text) doesn't sound robotically identical every
      // time. category/rank/kind are small enums, so a modest bump is unlikely
      // to destabilize them, but this is a judgment call worth re-checking if
      // classification quality drops.
      temperature: 0.2,
      maxTokens: 500,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpException({ error: 'parse_error' }, HttpStatus.BAD_GATEWAY);
    }

    // Read for every outcome, off-topic included: a customer venting at Rico
    // is off-topic and is exactly who should get a short answer back.
    const mood = validateMood(parsed.mood);

    if (parsed.offTopic === true) {
      return {
        offTopic: true,
        reply: typeof parsed.reply === 'string' ? parsed.reply : null,
        intents: [],
        mood,
      };
    }

    const rawIntents = Array.isArray(parsed.intents) ? parsed.intents.slice(0, MAX_INTENTS) : [];
    const intents = rawIntents.map(validateIntent).filter(Boolean);

    // النموذج ردّ بنوايا لكن ما نجت منها ولا وحدة (فئة مخترعة، مهنة خارج
    // القائمة، طلب بلا محل...). كان هذا يرمي 502، والعميل يفسّر أي خطأ كفشل
    // خادم فيسقط للمطابقة المحلية بالكلمات المفتاحية — وهي بدورها ترجع
    // "مطعم" كافتراضي لأي رسالة بلا كلمة فئة. فالنتيجة إن سؤالاً غير مفهوم
    // يُجاب ببحث عن مطاعم قريبة، وهو أسوأ رد ممكن.
    //
    // الخادم هنا يعرف أكثر من العميل: النداء نجح والنموذج ردّ، بس ما طلع
    // منه طلب نفهمه. فيُعامل كطلب توضيح صريح بدل خطأ — نستخدم reply النموذج
    // إذا كتب واحداً، وإلا نص ثابت بلهجة العلامة.
    if (intents.length === 0) {
      const brand = brandFor(dto.brand);
      const modelReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
      const reply = modelReply || clarifyReplyFor(brand);

      // هون بالضبط ريكو بيعترف إنه ما فهم — فهون بالضبط ينحفظ السؤال.
      // مش عند offTopic: التحية والشكر والسؤال عن الخدمة كلها offTopic
      // وريكو بيجاوبها صح، فتسجيلها بيغرق الطابور بضجيج. أما الوصول لهون
      // فمعناه إن النموذج ردّ وما طلع منه ولا نية نقدر ننفذها — وهاي فجوة
      // حقيقية بالفهم، بتستاهل درس.
      //
      // بلا await: المستخدم مستني رده، وكتابة سطر تعلّم ما بتستاهل تأخيره
      // ولا تحويل رد ناجح لخطأ. و.catch() موجود رغم إن record بيبلع أخطاءه
      // أصلاً — وعد غير منتظَر برفض بيوقّف Node كلها، وهاد ثمن ما بنقبله
      // مقابل سطر إحصائي.
      this.learning
        .record({
          message: dto.message,
          brand: dto.brand || DEFAULT_BRAND,
          dialect: brand.dialect,
          ricoReply: reply,
        })
        .catch(() => undefined);

      return { offTopic: true, reply, intents: [], mood };
    }

    return { offTopic: false, reply: null, intents, mood };
  }
}
