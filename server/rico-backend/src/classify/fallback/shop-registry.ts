// The shops and products Rico actually has, live in this process.
//
// The agent corpus showed where the keyword fallback fails on orders: shop
// names it has never seen ("مطعم تاج محل", "بقالة ابو احمد", "غاز العتيبي").
// The fixed brand list in keyword-tables.ts can't keep up with that — every
// partner the owner signs, every place Google search caches, is a name some
// customer will type. ShopNamesService fills this registry from the Business
// and Product collections at boot and every few minutes after, so a shop
// added today is understood on the next refresh, with no deploy.
//
// Same bargain as the lesson and profession registries: empty until the
// first read, and an empty registry changes nothing.

import { normalizeArabic } from '../../learning/constants/normalize';

export interface KnownShop {
  /** The name as the shop writes it — what an order's placeName carries. */
  name: string;
  /** Its category slug, when it has one ("restaurant", "pharmacy"…). */
  category: string | null;
  /** Whether it has a menu on Rico — only these can actually take an order. */
  hasMenu: boolean;
}

interface Entry {
  tokens: string[];
  shop: KnownShop;
}

const fold = (s: string) => normalizeArabic(s).replace(/(\p{L})\1{2,}/gu, '$1');
/** Tokens compared without "ال": "البيك" and "بيك" are the same shop. */
const bare = (t: string) => t.replace(/^ال/u, '');

/** Words a shop name opens with that say what it is, not who it is: "مطعم
 * تاج محل" is also found as "تاج محل". */
const KIND_WORDS = new Set(
  [
    'مطعم', 'مطاعم', 'صيدليه', 'صيدليات', 'حلويات', 'مخبز', 'مخابز', 'فرن', 'افران', 'كافيه', 'كوفي', 'مقهى', 'سوبرماركت', 'سوبر',
    'ماركت', 'بقاله', 'تموينات', 'محل', 'محلات', 'ملحمه', 'ملاحم', 'محمص', 'محمصه', 'مطابخ', 'مطبخ', 'شركه', 'مؤسسه', 'مكتب',
    'مركز', 'مجمع', 'restaurant', 'cafe', 'coffee', 'pharmacy', 'bakery', 'market', 'supermarket', 'sweets',
  ].map(fold),
);

/** Names many shops share ("صيدلية الشفاء", "بقالة النور"): fine as part of
 * a full name, too vague alone. */
const COMMON_NAMES = new Set(
  ['الشفاء', 'الصحه', 'النور', 'الامل', 'السلام', 'الخير', 'الحياه', 'الرحمه', 'البركه', 'الوفاء', 'الاصيل', 'الجوده', 'الريان', 'الامانه', 'النجاح', 'الهدى', 'الفرح', 'المدينه', 'العاصمه', 'الشرق', 'الوطنيه', 'الوطني']
    .map(fold)
    .map(bare),
);

/** Ceilings: a city's worth of cached places is a few thousand; this keeps a
 * runaway collection from eating the process. */
export const MAX_SHOPS = 30_000;
export const MAX_PRODUCT_WORDS = 50_000;

/** Names are indexed by their first word — or first two when the first only
 * says what kind of shop it is, since thousands of names open with "مطعم". */
function indexKey(tokens: string[]): string {
  return KIND_WORDS.has(tokens[0]) && tokens[1] ? `${tokens[0]} ${tokens[1]}` : tokens[0];
}

class ShopRegistry {
  private byFirst = new Map<string, Entry[]>();
  private productWords = new Set<string>();
  private count = 0;
  /** Bumped on every replace. */
  version = 0;

  /**
   * Rebuilds the index. [isGeneric] says whether a single word already
   * means something to the classifier ("صيدلية", "شاورما", "قريب") — a shop
   * whose whole name is such a word would turn ordinary sentences into
   * searches for it, so it's left out.
   */
  replaceAll(shops: KnownShop[], productNames: string[], isGeneric: (word: string) => boolean): void {
    const byFirst = new Map<string, Entry[]>();
    const seen = new Set<string>();
    let count = 0;
    const add = (tokens: string[], shop: KnownShop) => {
      if (!tokens.length) return;
      // One generic word is not a name ("صيدلية", "Pharmacy").
      if (tokens.length === 1 && (tokens[0].length < 3 || isGeneric(tokens[0]) || COMMON_NAMES.has(bare(tokens[0])))) return;
      // Nor is a run of generic words ("مطعم شاورما").
      if (tokens.every((t) => isGeneric(t) || KIND_WORDS.has(t))) return;
      const bareTokens = tokens.map(bare);
      const joined = bareTokens.join(' ');
      if (seen.has(joined)) return;
      seen.add(joined);
      const key = indexKey(bareTokens);
      const list = byFirst.get(key) ?? [];
      list.push({ tokens: bareTokens, shop });
      byFirst.set(key, list);
      count++;
    };

    // Shops with a menu first: when two share a name, the one that can take
    // the order is the one meant.
    const ordered = [...shops].sort((a, b) => Number(b.hasMenu) - Number(a.hasMenu)).slice(0, MAX_SHOPS);
    for (const shop of ordered) {
      for (const name of new Set([shop.name].filter(Boolean))) {
        const tokens = fold(name).split(' ').filter(Boolean);
        add(tokens, shop);
        // "مطعم تاج محل" is also "تاج محل" — when what's left is a name.
        if (tokens.length > 1 && KIND_WORDS.has(bare(tokens[0]))) {
          const rest = tokens.slice(1);
          if (rest.length > 1 || (rest[0].length >= 4 && !isGeneric(rest[0]))) add(rest, shop);
        }
      }
    }
    for (const list of byFirst.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);

    const words = new Set<string>();
    for (const name of productNames) {
      for (const w of fold(name).split(' ')) {
        if (words.size >= MAX_PRODUCT_WORDS) break;
        if (w.length >= 3 && !/^\d+$/u.test(w) && !KIND_WORDS.has(bare(w))) words.add(bare(w));
      }
    }

    this.byFirst = byFirst;
    this.productWords = words;
    this.count = count;
    this.version++;
  }

  /** The longest known shop name starting at [i] in folded tokens, or null. */
  matchAt(folded: string[], i: number): { length: number; shop: KnownShop } | null {
    const first = folded[i];
    if (!first) return null;
    const tokens = folded.slice(i, i + 6).map(bare);
    const candidates = this.byFirst.get(indexKey(tokens));
    if (!candidates) return null;
    for (const e of candidates) {
      if (e.tokens.every((t, k) => tokens[k] === t)) return { length: e.tokens.length, shop: e.shop };
    }
    return null;
  }

  /** Whether a folded word appears in some product name on Rico. */
  isProductWord(word: string): boolean {
    return this.productWords.has(bare(word));
  }

  get size(): number {
    return this.count;
  }
}

export const shopRegistry = new ShopRegistry();
