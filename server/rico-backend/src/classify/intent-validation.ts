// The rules that decide whether the model's answer is something Rico can act
// on. Lifted out of classify.service so it can be reused without importing
// the service: the learning module validates a *proposed* lesson through the
// exact same gate a live answer goes through, and importing the service there
// would close an import cycle (the service now records gaps through that
// module).

import { CATEGORIES, OTHER_TAG_KEYS, RANKS } from './constants/classify.constants';
import { isKnownProfession, professionLabel } from '../professionals/constants/professions.registry';

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface Intent {
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

// Clamps to a valid 1-10 position, or null if absent/out of range — same
// "drop, don't reject" philosophy as the rest of this function.
function parseReferencedPosition(raw: any): number | null {
  const n = raw?.referencedPosition;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

// Validates one intent element, or returns null if it's unsalvageable — an
// invalid element is dropped rather than rejecting the whole message.
export function validateIntent(raw: any): Intent | null {
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

  // An order needs somewhere to order *from*, in one of two ways.
  //
  // Either the customer named the shop ("بدي أطلب من مطعم الماهر") — then the
  // dishes are optional, since naming a shop alone is a request to see its
  // menu. Or they named only a kind of shop and the dishes ("وصّلي من مطعم
  // وجبتين شاورما") — then the dishes are what makes it an order at all, and
  // the server picks the shop by which nearby one actually sells them.
  //
  // A kind of shop with no dishes ("وصّلي من مطعم") is neither: it is a plain
  // search for restaurants, and the place path answers it better. The prompt
  // says so; this drops it if the model forgets.
  if (raw.kind === 'order') {
    const placeName = typeof raw.placeName === 'string' ? raw.placeName.trim() : '';
    const orderItems = parseOrderItems(raw.orderItems);
    const category = (CATEGORIES as readonly string[]).includes(raw.category) ? raw.category : null;
    if (placeName.length > 120) return null;
    if (!placeName && !(category && orderItems.length > 0)) return null;
    return {
      kind: 'order',
      category: placeName ? null : category,
      rank: 'nearest',
      brandHint: null,
      customTag: null,
      label: null,
      referencedPosition: null,
      profession: null,
      placeName: placeName || null,
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
