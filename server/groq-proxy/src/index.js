// Mirrors CATEGORIES in rico-backend/src/classify/constants/categories.ts.
// Both classifiers must offer the model the same list: a slug this Worker
// omits is one it rejects in normalizeIntent below, so the intent is
// dropped rather than searched.
const CATEGORIES = [
  'restaurant',
  'cafe',
  'pharmacy',
  'supermarket',
  'fuel',
  'mall',
  'atm',
  'bank',
  'hospital',
  'clinic',
  'fitness_centre',
  'hotel',
  'clothes',
  'mobile_phone',
  'electronics',
  'hairdresser',
  'beauty',
  'car_wash',
  'dentist',
  'mosque',
  'park',
  'bakery',
  'sweets',
  'bookstore',
  'toy_store',
  'pet_store',
  'jewelry_store',
  'furniture_store',
  'shoe_store',
  'gift_shop',
  'florist',
  'laundry',
  'veterinary',
  'car_repair',
  'car_dealer',
  'car_rental',
  'parking',
  'lawyer',
  'real_estate',
  'travel_agency',
  'insurance',
  'school',
  'university',
  'kindergarten',
  'library',
  'phone_repair',
  'appliance_repair',
  'maintenance_centre',
  'oil_change',
  'money_exchange',
  'tailor',
  'butcher',
  'cosmetics',
  'hardware_store',
  'auto_parts',
  'sporting_goods',
  'optician',
  'cinema',
  'amusement',
  'post_office',
  'police',
  'government_office',
];

const OTHER_TAG_KEYS = ['amenity', 'shop', 'leisure', 'tourism', 'office', 'craft'];
const RANKS = ['nearest', 'cheapest', 'open_now', 'best_rated'];
const MAX_INTENTS = 3;

const SYSTEM_PROMPT = `أنت مصنّف نوايا لتطبيق "ريكو" الذي يساعد المستخدمين في السعودية على إيجاد أقرب مكان والعروض المتاحة، وليس للدردشة معه.

قد تحتوي رسالة واحدة أكثر من طلب مستقل مفصولة بـ"و" أو "أو" أو "،" (مثال: "أقرب مطعم أو أرخص كافيه، وايش العروض المتوفرة؟"). هذا مهم جداً وهو مصدر أخطاء متكرر: يجب أن تحلّل *كل* طلب مستقل ذُكر في الرسالة، لا أن تختار طلباً واحداً فقط وتتجاهل الباقي — حتى لو كانت الطلبات مفصولة بـ"أو" (أو هنا تعني "أعطني كل هذه الأشياء"، وليست اختياراً بين بديلين تختار منه واحداً). قبل أن تجيب، عُدّ عدد الطلبات المستقلة في الرسالة، وتأكد أن طول القائمة intents يساوي هذا العدد بالضبط (بحد أقصى ${MAX_INTENTS}). إذا كانت الرسالة تطلب شيئاً واحداً فقط، أعد عنصراً واحداً.

مثال كامل — الرسالة: "وش أقرب مطعم أو أرخص كافيه، وايش العروض المتوفرة؟" تحتوي ٣ طلبات مستقلة (مطعم، كافيه، عروض)، لذا الناتج الصحيح:
{"offTopic": false, "reply": null, "intents": [
  {"kind": "place", "category": "restaurant", "rank": "nearest", "brandHint": null, "customTag": null, "label": null},
  {"kind": "place", "category": "cafe", "rank": "cheapest", "brandHint": null, "customTag": null, "label": null},
  {"kind": "deals", "category": null, "rank": "nearest", "brandHint": null, "customTag": null, "label": "العروض"}
]}
ناتج خاطئ لنفس الرسالة (يجب تفاديه): إرجاع عنصر "deals" وحده متجاهلاً طلبي المطعم والكافيه، أو إرجاع عنصر واحد فقط بشكل عام لرسالة تحتوي عدة طلبات.

قد تُرسل معها رسائل سابقة من نفس المحادثة (history) لتوفير السياق. إذا كانت الرسالة الحالية استكمالاً أو تعديلاً لطلب سابق (مثل "أبعد شوي"، "بس المفتوح الحين"، "نفس الشي بس أرخص")، استخدم history لتحديد النية الصحيحة بدلاً من افتراض offTopic.

كل عنصر في intents يمثّل أحد نوعين (kind):
- "place": طلب إيجاد مكان.
  - category يجب أن تكون إحدى هذه الفئات بالضبط: ${CATEGORIES.join(', ')}, other.
  - إذا كان الطلب يخص مكاناً حقيقياً لا يطابق أياً من الفئات الثابتة (مثل "مغسلة سيارات" أو "محل حلاقة")، استخدم category="other" مع:
    - customTag: تخمين لوسم OpenStreetMap مناسب، بالشكل {"key": "...", "value": "..."} حيث key يجب أن يكون أحد: ${OTHER_TAG_KEYS.join(', ')}، وvalue بحروف إنجليزية صغيرة وأرقام وunderscore فقط (مثال: {"key":"shop","value":"car_wash"}).
    - label: اسم عربي قصير للفئة (مثال: "مغسلة سيارات").
  - لغير "other" اجعل customTag=null وlabel=null.
  - rank يجب أن تكون واحدة من: "nearest" (افتراضي، أقرب مكان)، "cheapest" (طلب صريح "الأرخص"/"الأوفر")، "open_now" (طلب صريح مكان "مفتوح الحين/الآن"/"فاتح الحين")، "best_rated" (طلب صريح "الأفضل تقييماً"/"الأعلى تقييم"). إذا لم يُذكر شيء صريح، استخدم "nearest".
  - brandHint اسم العلامة التجارية أو المكان المحدد فقط إذا ذكره المستخدم صراحة (مثال: "ستاربكس")، وإلا اجعله null.
- "deals": طلب عروض أو خصومات (مثال: "وش العروض المتوفرة؟"، "فيه خصومات؟"). category=null, rank="nearest", customTag=null, brandHint=null, label="العروض" (أو اسم عربي قصير مشابه إذا ذكر المستخدم نوعاً محدداً من العروض).

استخدم offTopic=true فقط لرسالة لا تطلب مكاناً ولا عروضاً ولا هي استكمال لطلب سابق (تحية، سؤال عام، شكر، دردشة عابرة...)، واجعل intents مصفوفة فارغة []. اكتب reply في هذه الحالة فقط: جملة عربية قصيرة وودودة واحدة تذكّر المستخدم بلطف أن ريكو مخصص لإيجاد أقرب مطعم أو كافيه أو صيدلية وغيرها والعروض المتاحة، مع مثال مثل "أقرب مطعم". لغير ذلك اجعل reply=null دائماً (لا حاجة له).

أعد الناتج بصيغة JSON فقط بدون أي نص إضافي وبالشكل التالي بالضبط:
{"offTopic": true|false, "reply": "..."|null, "intents": [{"kind": "place"|"deals", "category": "..."|null, "rank": "nearest"|"cheapest"|"open_now"|"best_rated", "brandHint": "..."|null, "customTag": {"key": "...", "value": "..."}|null, "label": "..."|null}]}`;

function isValidHistory(history) {
  if (history === undefined) return true;
  if (!Array.isArray(history) || history.length > 6) return false;
  return history.every(
    (m) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.length > 0 &&
      m.content.length <= 300,
  );
}

// Called directly from the Flutter web build's browser context, which
// enforces CORS — needed for the app to reach this Worker at all when
// running as a web app (native mobile/desktop builds aren't affected).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// يتحقق من عنصر نية واحد ويطبّعه، أو يرجع null إذا كان غير صالح تماماً
// (العنصر غير الصالح يُستبعد بدل رفض الرسالة كلها — انظر موضع الاستدعاء).
function validateIntent(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.kind === 'deals') {
    const rawLabel = typeof raw.label === 'string' ? raw.label.trim() : '';
    return {
      kind: 'deals',
      category: null,
      rank: 'nearest',
      brandHint: null,
      customTag: null,
      label: rawLabel && rawLabel.length <= 40 ? rawLabel : 'العروض',
    };
  }

  if (raw.kind !== 'place') return null;

  const category = raw.category;
  if (category !== 'other' && !CATEGORIES.includes(category)) return null;

  const rank = RANKS.includes(raw.rank) ? raw.rank : 'nearest';

  let customTag = null;
  let label = null;
  if (category === 'other') {
    const tag = raw.customTag;
    const key = tag && typeof tag.key === 'string' ? tag.key : '';
    const value = tag && typeof tag.value === 'string' ? tag.value : '';
    const rawLabel = typeof raw.label === 'string' ? raw.label.trim() : '';

    if (
      !OTHER_TAG_KEYS.includes(key) ||
      !/^[a-z0-9_]+$/.test(value) ||
      !rawLabel ||
      rawLabel.length > 40
    ) {
      return null;
    }

    customTag = { key, value };
    label = rawLabel;
  }

  const brandHintRaw = typeof raw.brandHint === 'string' ? raw.brandHint.trim() : '';

  return {
    kind: 'place',
    category,
    rank,
    brandHint: brandHintRaw && brandHintRaw.length <= 60 ? brandHintRaw : null,
    customTag,
    label,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const message = (body && body.message ? String(body.message) : '').trim();
    if (!message || message.length > 500) {
      return jsonResponse({ error: 'invalid_message' }, 400);
    }

    const history = body ? body.history : undefined;
    if (!isValidHistory(history)) {
      return jsonResponse({ error: 'invalid_history' }, 400);
    }

    if (!env.GROQ_API_KEY) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    let groqResponse;
    try {
      groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...(history || []),
            { role: 'user', content: message },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 350,
        }),
      });
    } catch {
      return jsonResponse({ error: 'upstream_unreachable' }, 502);
    }

    if (!groqResponse.ok) {
      return jsonResponse({ error: 'upstream_error', status: groqResponse.status }, 502);
    }

    const data = await groqResponse.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return jsonResponse({ error: 'parse_error' }, 502);
    }

    if (parsed.offTopic === true) {
      return jsonResponse(
        { offTopic: true, reply: typeof parsed.reply === 'string' ? parsed.reply : null, intents: [] },
        200,
      );
    }

    const rawIntents = Array.isArray(parsed.intents) ? parsed.intents.slice(0, MAX_INTENTS) : [];
    const intents = rawIntents.map(validateIntent).filter(Boolean);

    if (intents.length === 0) {
      return jsonResponse({ error: 'invalid_intents' }, 502);
    }

    return jsonResponse({ offTopic: false, reply: null, intents }, 200);
  },
};
