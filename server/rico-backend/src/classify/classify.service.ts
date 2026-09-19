import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { brandFor } from '../common/constants/brands';
import { buildSystemPrompt, CATEGORIES, MAX_INTENTS, OTHER_TAG_KEYS, RANKS } from './constants/classify.constants';
import { ClassifyRequestDto, LastResultsDto } from './dto/classify-request.dto';
import { isKnownProfession, professionLabel } from '../professionals/constants/professions.registry';

interface OrderItem {
  name: string;
  quantity: number;
}

interface Intent {
  kind: 'place' | 'deals' | 'professional' | 'order';
  category: string | null;
  rank: string;
  brandHint: string | null;
  customTag: { key: string; value: string } | null;
  label: string | null;
  referencedPosition: number | null;
  /** Trade slug, for kind='professional' only — null otherwise. */
  profession: string | null;
  /** Shop the customer named, for kind='order' only — null otherwise. */
  placeName?: string | null;
  /** Dishes they asked for, for kind='order' only. */
  orderItems?: OrderItem[];
}

const MAX_ORDER_ITEMS = 20;

// The model is told to copy item names verbatim, so nothing here tries to
// correct them — it only enforces shape and size. Matching them to a real
// catalogue happens later, against real data (PublicService.resolveOrder).
function parseOrderItems(raw: any): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  const items: OrderItem[] = [];
  for (const entry of raw.slice(0, MAX_ORDER_ITEMS)) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!name || name.length > 80) continue;
    const q = entry?.quantity;
    items.push({ name, quantity: Number.isInteger(q) && q >= 1 && q <= 99 ? q : 1 });
  }
  return items;
}

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

// Clamps to a valid 1-10 position, or null if absent/out of range — same
// "drop, don't reject" philosophy as the rest of this function.
function parseReferencedPosition(raw: any): number | null {
  const n = raw?.referencedPosition;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

// Validates one intent element, or returns null if it's unsalvageable — an
// invalid element is dropped rather than rejecting the whole message.
function validateIntent(raw: any): Intent | null {
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
      referencedPosition: parseReferencedPosition(raw),
      profession: null,
    };
  }

  // A person who does a trade, not a place that sells something. Dropped
  // unless the profession is one we actually have a slug for: an invented
  // trade would search for nobody, and falling back to a place search would
  // answer "أبغى دهان" with a paint shop — a different thing than a painter.
  if (raw.kind === 'professional') {
    if (!isKnownProfession(raw.profession)) return null;
    return {
      kind: 'professional',
      category: null,
      rank: 'nearest',
      brandHint: null,
      customTag: null,
      label: professionLabel(raw.profession),
      referencedPosition: parseReferencedPosition(raw),
      profession: raw.profession,
    };
  }

  // An order needs a shop; the dishes are optional. "بدي أطلب من مطعم الماهر"
  // names somewhere without saying what, and opening that shop's menu answers
  // it far better than dropping the intent and falling back to a generic
  // "nearest restaurant" search.
  if (raw.kind === 'order') {
    const placeName = typeof raw.placeName === 'string' ? raw.placeName.trim() : '';
    const orderItems = parseOrderItems(raw.orderItems);
    if (!placeName || placeName.length > 120) return null;
    return {
      kind: 'order',
      category: null,
      rank: 'nearest',
      brandHint: null,
      customTag: null,
      label: null,
      referencedPosition: null,
      profession: null,
      placeName,
      orderItems,
    };
  }

  if (raw.kind !== 'place') return null;

  const category = raw.category;
  if (category !== 'other' && !(CATEGORIES as readonly string[]).includes(category)) return null;

  const rank = (RANKS as readonly string[]).includes(raw.rank) ? raw.rank : 'nearest';

  let customTag: { key: string; value: string } | null = null;
  let label: string | null = null;
  if (category === 'other') {
    const tag = raw.customTag;
    const key = tag && typeof tag.key === 'string' ? tag.key : '';
    const value = tag && typeof tag.value === 'string' ? tag.value : '';
    const rawLabel = typeof raw.label === 'string' ? raw.label.trim() : '';

    if (!(OTHER_TAG_KEYS as readonly string[]).includes(key) || !/^[a-z0-9_]+$/.test(value) || !rawLabel || rawLabel.length > 40) {
      return null;
    }

    customTag = { key, value };
    label = rawLabel;
  }

  const brandHintRaw = typeof raw.brandHint === 'string' ? raw.brandHint.trim() : '';
  const referencedPosition = parseReferencedPosition(raw);

  return {
    kind: 'place',
    category,
    rank,
    // referencedPosition and brandHint are mutually exclusive by design (see
    // SYSTEM_PROMPT's "الإشارة لنتيجة سابقة" section) — enforce it here too
    // rather than trusting the model never mixes them.
    brandHint: referencedPosition === null && brandHintRaw && brandHintRaw.length <= 60 ? brandHintRaw : null,
    customTag,
    label,
    referencedPosition,
    profession: null,
  };
}

// Exposed for tests only: validateIntent is where a malformed model response
// gets turned into something safe, and that deserves direct coverage rather
// than being reachable only through a live Groq call.
export const validateIntentForTest = validateIntent;

@Injectable()
export class ClassifyService {
  constructor(private readonly llm: LlmService) {}

  async classify(dto: ClassifyRequestDto) {
    // A second mid-conversation system-role message isn't something
    // Llama-family chat templates are trained on (system is reserved for
    // position 0), so "last shown results" context is appended to the one
    // system turn instead of injected as its own message.
    const prompt = buildSystemPrompt(brandFor(dto.brand));
    const systemContent = dto.lastResults ? `${prompt}${buildLastResultsBlock(dto.lastResults)}` : prompt;

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

    if (parsed.offTopic === true) {
      return {
        offTopic: true,
        reply: typeof parsed.reply === 'string' ? parsed.reply : null,
        intents: [],
      };
    }

    const rawIntents = Array.isArray(parsed.intents) ? parsed.intents.slice(0, MAX_INTENTS) : [];
    const intents = rawIntents.map(validateIntent).filter(Boolean);

    if (intents.length === 0) {
      throw new HttpException({ error: 'invalid_intents' }, HttpStatus.BAD_GATEWAY);
    }

    return { offTopic: false, reply: null, intents };
  }
}
