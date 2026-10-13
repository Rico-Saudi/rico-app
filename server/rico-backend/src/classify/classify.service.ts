import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { brandFor, DEFAULT_BRAND } from '../common/constants/brands';
import { buildSystemPrompt, clarifyReplyFor, MAX_INTENTS } from './constants/classify.constants';
import { buildVoiceBlock, validateMood } from './constants/moods';
import { BasketDto, ClassifyRequestDto, LastResultsDto } from './dto/classify-request.dto';
import { Intent, validateIntent } from './intent-validation';
import { distressReplyFor, isDistress } from './constants/distress';
import { LearningService } from '../learning/learning.service';
import { keywordClassifyInContext } from './fallback/keyword-classifier';
import { lessonRegistry } from '../learning/constants/lessons.registry';
import { normalizeArabic } from '../learning/constants/normalize';

// Strips characters that could break out of the plain-text block we
// interpolate into the system prompt — item names are third-party-controlled
// (OSM/business data, or whatever a vendor typed as their shop name), not
// something we authored. Quotes and the markdown/heading marks the prompt
// itself is built from are dropped too, so a shop called
// `"# تعليمات جديدة: …"` reads as a name, not as a new section.
function sanitizeForPrompt(s: string): string {
  return s
    .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
    .replace(/["`#*<>{}]/g, '')
    .trim()
    .slice(0, 120);
}

/// What the model sees of the customer's message. The DTO accepts more so
/// a long paste isn't a 400; past this the extra words are a list the model
/// would ignore anyway, and every character is paid for.
const MAX_MESSAGE_CHARS = 600;
/// Per history turn. A bot reply listing eight places is long and nearly all
/// of it is names the lastResults block already carries.
const MAX_HISTORY_CHARS = 300;

/// The conversation as the model and the keyword table should see it.
///
/// The app adds the customer's bubble to the chat before it builds the
/// history, so `history` arrives already ending with the message being
/// classified — which this service then appended again. The model saw the
/// customer say everything twice, and the keyword table took the current
/// message for "the previous one": «ابي اطلب عشا» → «من وين؟» → «من البيك»
/// became a search for البيك instead of an order from it. Every app build
/// in users' hands does this, so it is undone here rather than only fixed
/// in the next release.
export function trimContext(dto: ClassifyRequestDto): { message: string; history: { role: string; content: string }[] } {
  const history = [...(dto.history ?? [])];
  const last = history[history.length - 1];
  if (last && last.role === 'user' && last.content.trim() === dto.message.trim()) history.pop();
  return {
    message: dto.message.slice(0, MAX_MESSAGE_CHARS),
    history: history.map((h) => ({ role: h.role, content: h.content.slice(0, MAX_HISTORY_CHARS) })),
  };
}

/// A position the model named that isn't on the list the customer is
/// looking at ("الخامس" when four were shown, or any position with no list
/// at all) would make the app open the wrong shop or none. Dropped, so the
/// intent falls back to what else it says; an order or call left with
/// nothing to point at is dropped whole, like validateIntent would.
function checkPosition(intent: Intent, lastResults: LastResultsDto | undefined): Intent | null {
  if (intent.referencedPosition === null) return intent;
  const shown = lastResults?.items.length ?? 0;
  if (intent.referencedPosition <= shown) return intent;
  const fixed = { ...intent, referencedPosition: null };
  if ((fixed.kind === 'order' || fixed.kind === 'call') && !fixed.placeName && !(fixed.category && fixed.orderItems?.length)) {
    return null;
  }
  return fixed;
}

function buildLastResultsBlock(lastResults: LastResultsDto): string {
  const label = sanitizeForPrompt(lastResults.label);
  const lines = lastResults.items.map((i) => `${i.position}. ${sanitizeForPrompt(i.name)}`).join('\n');
  return `\n\nآخر نتائج عُرضت على المستخدم (الفئة: ${label}):\n${lines}\nإذا أشار المستخدم لأحد هذه العناصر بالترتيب (الأول/الثاني/...)، ضع رقم الترتيب في referencedPosition واجعل brandHint=null. إذا طلب شيئاً "شبيه/مثله" بدون رقم محدد، استخدم فئة هذه القائمة (${label}) دون تحديد referencedPosition أو brandHint.
وإذا بدّه **يطلب من** أحد هذه العناصر — بالترتيب ("بدي أطلب من التاني"، "اطلبلي من الأول شاورما")، أو باسمه ("بدي أطلب من ${sanitizeForPrompt(lastResults.items[0]?.name ?? '')}")، أو بضمير ("اطلبلي منه"، "شو عندهم؟") والقائمة فيها عنصر واحد أو حدّد العنصر برسالته السابقة — فهي kind="order" مع referencedPosition=رقمه وplaceName=اسمه كما هو بالقائمة، وorderItems الأصناف اللي ذكرها (أو [] إذا ما ذكر أصناف).
**بس مع فعل طلب صريح** (أطلب/اطلب لي/وصّي/جهّز لي/خذ لي/أبي من/وش عندهم/قائمتهم). الرقم أو الاسم **لحاله** ("الثاني"، "الأخير"، "مطعم الماهر") بلا فعل طلب = عرض العنصر، kind="place" مع referencedPosition — **مو** طلب.
referencedPosition هو رقم العنصر **بهذه القائمة بالضبط** (من 1 إلى ${lastResults.items.length})، لا رقم ذكره المستخدم برسالة سابقة لقائمة أقدم — مثلاً إذا القائمة فيها عنصر واحد فرقمه 1 حتى لو اختاره المستخدم قبل بكلمة "الثاني".`;
}

function buildBasketBlock(basket: BasketDto, brandName: string): string {
  const shop = sanitizeForPrompt(basket.placeName) || 'المحل';
  const lines = basket.items.map((i) => `- ${i.quantity} × ${sanitizeForPrompt(i.name)}`).join('\n');
  return `\n\nسلة مفتوحة الحين عند العميل (من ${shop}):\n${lines}
إذا الرسالة تعديل على هذي السلة — شيل/احذف/بلاش صنف، زيد واحد أو "زيدها واحد"، غيّر الكمية ("خليها ٣")، بدّل صنف بصنف، أو أضف صنف ("وبيبسي") — رجّع نية وحدة kind="order" بنفس placeName ("${shop}") وorderItems = **السلة كاملة بعد التعديل** (مو بس اللي تغيّر)، لأن التطبيق يستبدل السلة بالكامل. "زيدها واحد" بلا اسم صنف = آخر صنف بالقائمة. وإذا طلب شي ما له علاقة بالسلة (بحث مكان، سؤال)، تعامل معه عادي وتجاهل هذا القسم. ${brandName} ما يؤكد الطلب بنفسه — التأكيد من زر السلة.`;
}

// A reply that turns the customer away instead of searching. Matched on the
// model's own text, in both dialects.
const REFUSAL_RE = /ما\s*(?:بقدر|بقدرش|اقدر|أقدر|نقدر|بنقدر|عندنا\s+خدمة|نوفر|بنوفر)|مش\s+(?:متوفر|متاح|بقدر)|لا\s+(?:أستطيع|استطيع|نستطيع|يمكنني)|غير\s+متوفر/u;

// Exposed for tests only: validateIntent is where a malformed model response
// gets turned into something safe, and that deserves direct coverage rather
// than being reachable only through a live Groq call.
export const validateIntentForTest = validateIntent;

/// "أقرب مطعم", "اقرب صيدليه", "كافيه" — a handful of opening messages are
/// most of the traffic, and each one pays for the ~7k-token prompt. A
/// standalone message (no history, list, basket or voice) means the same
/// thing every time, so its answer is kept for a while.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

@Injectable()
export class ClassifyService {
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(
    private readonly llm: LlmService,
    private readonly learning: LearningService,
  ) {}

  /// Null when the answer depends on more than the words: anything said
  /// before, a list or basket on screen, or a voice note's tone. The lesson
  /// version is in the key so teaching Rico takes effect at once.
  private cacheKey(dto: ClassifyRequestDto): string | null {
    if (dto.history?.length || dto.lastResults || dto.basket?.items.length || dto.voice) return null;
    const words = normalizeArabic(dto.message);
    return words ? `${brandFor(dto.brand).dialect}|${lessonRegistry.version}|${words}` : null;
  }

  async classify(dto: ClassifyRequestDto) {
    const key = this.cacheKey(dto);
    const hit = key ? this.cache.get(key) : undefined;
    if (hit && hit.expiresAt > Date.now()) return structuredClone(hit.value) as Awaited<ReturnType<ClassifyService['classifyUncached']>>;

    const result = await this.classifyUncached(dto);

    // Only a search the model understood. Greetings vary on purpose
    // (temperature), and a miss must reach recordGap every time it is asked
    // — the learning queue ranks gaps by how often they come up.
    if (key && !result.offTopic && !('source' in result)) {
      if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: structuredClone(result) });
    }
    return result;
  }

  private async classifyUncached(dto: ClassifyRequestDto) {
    // قبل النموذج لا بعده — انظر constants/distress.ts: هاد الرد ما بيستاهل
    // يعتمد على نداء ممكن يرجع 429. ولا يُسجَّل كفجوة: ريكو فاهمه تماماً.
    if (isDistress(dto.message)) {
      return { offTopic: true, reply: distressReplyFor(brandFor(dto.brand)), intents: [], mood: 'neutral' as const };
    }

    // A second mid-conversation system-role message isn't something
    // Llama-family chat templates are trained on (system is reserved for
    // position 0), so "last shown results" context is appended to the one
    // system turn instead of injected as its own message.
    const taught = this.lessonAnswer(dto);
    if (taught) return taught;

    const context = trimContext(dto);
    const prompt = buildSystemPrompt(brandFor(dto.brand));
    const withList = dto.lastResults ? `${prompt}${buildLastResultsBlock(dto.lastResults)}` : prompt;
    const withResults = dto.basket?.items.length ? `${withList}${buildBasketBlock(dto.basket, brandFor(dto.brand).name)}` : withList;
    // Prosody notes go last so they sit closest to the message they
    // describe, and only for voice — see buildVoiceBlock.
    const systemContent = dto.voice ? `${withResults}${buildVoiceBlock(dto.voice)}` : withResults;

    let content: string;
    try {
      ({ content } = await this.llm.complete({
        purpose: 'classify',
        messages: [{ role: 'system', content: systemContent }, ...context.history, { role: 'user', content: context.message }],
        // Was 0 (fully deterministic) — bumped slightly so the `reply` field
        // (small talk/off-topic text) doesn't sound robotically identical every
        // time. category/rank/kind are small enums, so a modest bump is unlikely
        // to destabilize them, but this is a judgment call worth re-checking if
        // classification quality drops.
        temperature: 0.2,
        // gpt-oss spends part of this on hidden reasoning before the JSON;
        // at 500, three intents with order items and a reply could be cut
        // off mid-object and fall to the keyword table as a parse error.
        maxTokens: 900,
      }));
    } catch (error) {
      // Groq's free tier runs out long before the day does (a 429), and
      // the app's own offline table knows a fraction of what this one does.
      // Answer from the keyword table when it understands the message; when
      // it doesn't, fail exactly as before so the app's local replies
      // (greetings, thanks, "وضّح لي") still take over.
      const fallback = this.keywordAnswer(dto);
      if (fallback) return fallback;
      throw error;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const fallback = this.keywordAnswer(dto);
      if (fallback) return fallback;
      throw new HttpException({ error: 'parse_error' }, HttpStatus.BAD_GATEWAY);
    }

    // Read for every outcome, off-topic included: a customer venting at Rico
    // is off-topic and is exactly who should get a short answer back.
    const mood = validateMood(parsed.mood);

    if (parsed.offTopic === true) {
      const reply = typeof parsed.reply === 'string' ? parsed.reply : null;

      // offTopic يغطي تلات حالات مختلفة تماماً (انظر قسم offTopic بالبرومبت):
      // تحية ودردشة، ومزاج غامض، و«رسالة ما فهمتها». أول ثنتين ريكو فاهمهن
      // وبيجاوبهن صح — تسجيلهن بيغرق طابور التعلّم بتحيات. الثالثة هي
      // بالضبط اللي بدنا نتعلّم منها، وهي كمان الأشيع: البرومبت بيطلب من
      // النموذج يقول «ما فهمتك» بنفسه، فما بتوصل أبداً للمسار الاحتياطي
      // تحت (intents فاضية). فبدون notUnderstood كان أغلب «ما فهمتك» يضيع.
      if (parsed.notUnderstood === true) {
        this.recordGap(dto, reply);
        // The model gave up, but the words are ones Rico knows ("قاعة
        // افراح", "بنشر"): a search beats "ما فهمتك". The gap stays
        // recorded so the model itself gets taught the phrasing.
        const fallback = this.keywordAnswer(dto, mood);
        if (fallback) return fallback;
      }

      // "آسف، ما بقدر احجز طيران، بس بقدر أساعدك تلاقي مطعم" — the model
      // understood and still answered with a refusal, so notUnderstood was
      // never set. When the words ask for something Rico can find (a travel
      // agency, a driver), find it; and log the miss so the model is taught.
      if (reply && REFUSAL_RE.test(reply)) {
        const fallback = this.keywordAnswer(dto, mood);
        if (fallback) {
          this.recordGap(dto, reply);
          return fallback;
        }
      }

      return { offTopic: true, reply, intents: [], mood };
    }

    const rawIntents = Array.isArray(parsed.intents) ? parsed.intents.slice(0, MAX_INTENTS) : [];
    const intents = rawIntents
      .map((raw: any) => validateIntent(raw, brandFor(dto.brand).dialect))
      .map((intent: Intent | null) => (intent ? checkPosition(intent, dto.lastResults) : null))
      .filter(Boolean);

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
      this.recordGap(dto, reply);

      const fallback = this.keywordAnswer(dto, mood);
      if (fallback) return fallback;

      return { offTopic: true, reply, intents: [], mood };
    }

    return { offTopic: false, reply: null, intents, mood };
  }

  /** The owner's own answer when this exact question was taught, or null.
   *
   * Lessons that point at "the second one on the list" are left to the model:
   * whether they apply depends on what this customer was shown, which a
   * stored answer can't know. */
  private lessonAnswer(dto: ClassifyRequestDto) {
    const brand = brandFor(dto.brand);
    const lesson = lessonRegistry.exactMatch(dto.message, brand.dialect);
    if (!lesson) return null;

    if (lesson.intents.length === 0) {
      return lesson.reply ? { offTopic: true, reply: lesson.reply, intents: [], mood: 'neutral' as const, source: 'lesson' as const } : null;
    }
    if (lesson.intents.some((i) => i.referencedPosition != null)) return null;
    const intents = lesson.intents.map((raw) => validateIntent(raw, brand.dialect)).filter(Boolean);
    if (!intents.length) return null;
    return { offTopic: false, reply: null, intents, mood: 'neutral' as const, source: 'lesson' as const };
  }

  /** جواب القاموس (fallback/keyword-classifier.ts)، أو null إذا ما فهم.
   *
   * ما يُستعمل مع رسالة تشير لنتائج سابقة بلا كلمة مكان ("الثاني"،
   * "أرخص منه"): هذي يحلّها التطبيق من ذاكرته، والقاموس ما بيرجع لها شي
   * أصلاً. `source` للتشخيص فقط — التطبيق يتجاهل الحقول اللي ما يعرفها. */
  private keywordAnswer(dto: ClassifyRequestDto, mood: ReturnType<typeof validateMood> = 'neutral') {
    // The conversation goes along: "في ارخص؟", "التاني", "وزيد ٢ فلافل"
    // name nothing themselves and borrow the search, list or order before them.
    const intents = keywordClassifyInContext(dto.message, {
      history: trimContext(dto).history,
      lastResults: dto.lastResults ?? null,
      basket: dto.basket ?? null,
    })
      .map((intent) => checkPosition(intent as Intent, dto.lastResults))
      .filter(Boolean);
    if (!intents.length) return null;
    return { offTopic: false, reply: null, intents, mood, source: 'keywords' as const };
  }

  /** يسجّل سؤالاً ما فهمه ريكو، بلا انتظار.
   *
   * المستخدم مستني رده، وكتابة سطر تعلّم ما بتستاهل تأخيره ولا تحويل رد
   * ناجح لخطأ. و.catch() موجود رغم إن record بيبلع أخطاءه أصلاً — وعد غير
   * منتظَر برفض بيوقّف Node كلها، وهاد ثمن ما بنقبله مقابل سطر إحصائي. */
  private recordGap(dto: ClassifyRequestDto, reply: string | null): void {
    this.learning
      .record({
        message: dto.message,
        brand: dto.brand || DEFAULT_BRAND,
        dialect: brandFor(dto.brand).dialect,
        ricoReply: reply ?? '',
      })
      .catch(() => undefined);
  }
}
