// Reads an order out of a message: which shop, and what to put in the basket.
//
// Split out of keyword-classifier.ts once orders got their own agent corpus
// (scripts/agent-corpus/o*_*.jsonl): an order is graded on the shop *and*
// every item with its quantity, and the one-line heuristic it replaced got
// both right for a third of them. The classifier hands in what it knows about
// words (which are products, which name a kind of shop) through OrderDeps, so
// this file needs nothing from it at import time.
//
// What comes out is only ever a guess at names. Matching them against a real
// shop and its real menu happens later, on real data (PublicService.resolveOrder).

import { validateIntent, Intent } from '../intent-validation';
import { normalizeArabic } from '../../learning/constants/normalize';
import { ORDER_BRANDS, ORDER_VERBS, ORDINALS } from './keyword-tables';

export interface OrderDeps {
  /** The fixed category a few words name ("صيدليه" → pharmacy), or null. */
  categoryOf(text: string): string | null;
  /** Whether a folded word is something sold ("شاورما", "بنادول"). */
  isProduct(word: string): boolean;
}

export interface ParsedOrder {
  order: Intent;
  /** What follows the order ("وكمان وين اقرب صراف"), for the caller to read
   * as requests of its own. Empty when the message was all order. */
  rest: string;
}

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function fold(text: string): string {
  return normalizeArabic(text).replace(/(\p{L})\1{2,}/gu, '$1');
}

const set = (words: string[]) => new Set(words.map(fold));

/** Words for "from". Franco and English customers write them too. */
const FROM = set(['من', 'mn', 'min', 'from', 'men']);

/** Wants that make "ابي من البيك…" an order when a shop and items follow. */
const WANTS = set([
  'ابي', 'ابغى', 'ابغي', 'ابغا', 'بدي', 'بدنا', 'ابا', 'اريد', 'عايز', 'عاوز', 'نبي', 'نبغى', 'ودي', 'بغيت', 'abi', 'abgha',
  'abghi', 'bdi', 'bade', 'badi', 'baddi', 'want', 'need', 'بدها', 'بده', 'بدو', 'عايزه', 'عاوزه', 'ابيه', 'نبغي', 'هات',
  'يبون', 'يبي', 'تبي', 'يبغى', 'تبغى', 'يبغون',
]);

/** A noun that names a kind of shop, and needs a name after it to be one shop. */
const SHOP_NOUNS = set([
  'مطعم', 'مخبز', 'مخبزه', 'مخابز', 'فرن', 'صيدليه', 'حلويات', 'محل', 'بقاله', 'سوبرماركت', 'ماركت', 'كافيه', 'كوفي', 'مقهى',
  'ملحمه', 'محمص', 'محمصه', 'مطبخ', 'هايبر', 'مكتبه', 'زهور', 'ورود', 'شوكولاته', 'مول', 'دكان', 'دكانه', 'مؤسسه', 'سناك',
  'كافتيريا', 'بوفيه',
]);

/** "اي مطعم", "اقرب صيدلية": a kind of shop, whichever is nearest. */
const ANY_SHOP = set(['اي', 'أي', 'اقرب', 'any', 'ay', 'nearest', 'شي']);
/** "اي" leaves the shop to Rico; "اقرب" asks to find one. */
const ANY_PICK = set(['اي', 'أي', 'any', 'ay', 'شي']);
/** Words that describe a shop rather than name it ("سوبرماركت فاتح ٢٤ ساعة"). */
const NOT_NAME = set(['فاتح', 'فاتحه', 'مفتوح', 'مفتوحه', 'قريب', 'قريبه', 'رخيص', 'نظيف', 'زين', 'حلو', 'كبير', 'جديد', 'بعيد', 'اليوم', 'هلا', 'الحين']);
/** "مطعم قريب (علي)" — the same, said after the noun. */
const NEARBY = set(['قريب', 'قريبه', 'قريب علي', 'جنبي', 'nearby', 'near']);
const NEARBY_TAIL = set(['علي', 'مني', 'منا', 'منه', 'عندي']);

/** Words that join a shop's name to its next word: "ابو جبارة", "بيت الشاورما". */
/** "توصل لي", "تجيب": a shop asked to bring something. */
const BRING = set(['توصل', 'توصللي', 'يوصل', 'يوصلي', 'تجيب', 'تجيبلي', 'تبعتلي', 'تبعت', 'تودي']);
const WHERE = set(['وين', 'فين', 'wain', 'wen', 'wein', 'fen', 'where', 'دلني', 'دلوني', 'دورلي', 'دورلنا']);
/** Greetings and politeness that can open an order ("مرحبا، من البيك…"). */
const OPENERS = set(['مرحبا', 'هلا', 'السلام', 'عليكم', 'لو', 'تكرمت', 'سمحت', 'ممكن', 'ياريت', 'يا', 'ريت', 'ريكو', 'تدلل', 'please', 'pls', 'hi', 'hello', 'صباح', 'مساء', 'الخير', 'النور', 'طلبيتي', 'طلبي']);
/** Kinds of shop typed in Latin letters ("mn mat3am"), as opposed to names
 * that happen to be food ("shawarma house"). */
const LATIN_KINDS = set(['mat3am', 'ma6am', 'restaurant', 'supermarket', 'pharmacy', 'saydaliya', 'cafe', 'coffee', 'kofi', 'forn', 'bakery', 'florist', 'grocery', 'ba2ala', 'baqala']);
const NAME_LINKS = set(['ابو', 'ام', 'بيت', 'دار', 'بن', 'اولاد']);
/** A branch after a brand: "لولو هايبر", "كارفور سيتي مول". */
const BRANCH_WORDS = set(['هايبر', 'سيتي', 'مول', 'ماركت', 'اكسبرس', 'سنتر', 'بلس', 'express', 'market']);

/** Where the basket ends: what follows is a second request or a remark. */
const STOP = set([
  'وفيه', 'فيه', 'وعندكم', 'عندكم', 'وكمان', 'كمان', 'وين', 'وبعدين', 'بعدين', 'عشان', 'لو', 'اذا', 'وطلبي', 'طلبي', 'وكيف',
  'كيف', 'منهم', 'منها', 'ليش', 'هل', 'ووين', 'واذا', 'ولو', 'وش', 'شو', 'ايش', 'في', 'وفي', 'ووش', 'وشو', 'وايش',
  // A second request after the basket: "…وابي سباك", "…ودلني على عيادة".
  'وابي', 'وبدي', 'وابغى', 'وابغا', 'وبدنا', 'وبدها', 'ودلني', 'دلني', 'ودورلي', 'وبكرا', 'بكرا', 'ومن', 'واكتبوا', 'اكتبوا',
  'ويا', 'وياريت',
]);

/** Said around an order without being part of it. */
const FILLER = set([
  'كلهم', 'كله', 'كلها', 'الكل', 'مرحبا', 'تكرمت', 'هات', 'بس', 'وبس', 'شي',
  'لي', 'لنا', 'الي', 'يعني', 'اممم', 'امم', 'ام', 'ياريت', 'يا', 'ريت', 'ريكو', 'تدلل', 'سمحت', 'بليز', 'الله', 'يخليك', 'هلا',
  'هلق', 'الحين', 'هسا', 'بسرعه', 'please', 'عشا', 'عشاء', 'غدا', 'غداء', 'فطور', 'شي', 'اغراض', 'غراض', 'مقاضي', 'pls', 'ضروري', 'ممكن', 'منه', 'منكم', 'توصيل', 'توصل', 'يوصل', 'me', 'for',
  'the', 'some', 'get', 'can', 'you', 'i', 'order', 'اوردر', 'طيب', 'اوكي', 'ok',
]);

/** Counting words dropped from an item's name: "وجبتين شاورما" is two
 * شاورما, as the classifier prompt has it. Units ("كيلو") stay in the name. */
const COUNTERS = set(['وجبه', 'وجبات', 'حبه', 'حبات']);

const NUMBERS: Map<string, number> = new Map(
  Object.entries({
    واحد: 1, وحده: 1, اثنين: 2, تنتين: 2, ثنين: 2, ثنتين: 2, اتنين: 2, تنين: 2, ثلاث: 3, ثلاثه: 3, تلات: 3, تلاته: 3, اربع: 4, اربعه: 4, خمس: 5,
    خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تمن: 8, تمنيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10,
    عشرين: 20, ثلاثين: 30, تلاتين: 30, اربعين: 40, خمسين: 50, درزن: 12, دزينه: 12, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, ten: 10, dozen: 12,
  }).map(([k, v]) => [fold(k), v]),
);

/** Duals with an irregular singular; regular feminine ones ("كنافتين",
 * "ربطتين") are handled by shape in [dual]. */
const DUALS: Map<string, string | null> = new Map(
  Object.entries({
    وجبتين: null, حبتين: null, ساندويتشين: 'ساندويتش', ساندويشين: 'ساندويش', سندويشين: 'سندويش', صحنين: 'صحن', كرتونين: 'كرتون',
    كيلوين: 'كيلو', كاسين: 'كاس', كوبين: 'كوب', باكيتين: 'باكيت', كيسين: 'كيس', منسفين: 'منسف', رغيفين: 'رغيف', بيتزتين: 'بيتزا',
    كورتين: 'كورة', صحونين: 'صحن', قطعتين: 'قطعة', جالونين: 'جالون', دفترين: 'دفتر', بالونين: 'بالون', قلمين: 'قلم',
    كيكتين: 'كيكة', شريطين: 'شريط', بخاخين: 'بخاخ',
  }).map(([k, v]) => [fold(k), v]),
);
const NOT_DUAL = set(['بروتين', 'لاتين', 'كاتين', 'كراتين', 'بساتين']);

/** Words that start with "و" without it being "and": "وجبة", "وسط", "وايت". */
const VAW_WORDS = set([
  'وجبه', 'وجبات', 'وجبتين', 'وسط', 'وايت', 'ورق', 'ورد', 'ورده', 'وردات', 'ورود', 'وافل', 'ويفر', 'واحد', 'وحده', 'وزن', 'وايلد',
  'وردتين', 'وطني', 'وادي', 'واي', 'ووتر', 'ورقه', 'واقي', 'وايبس', 'وساده', 'وشاح', 'وعاء', 'وصفه', 'وسطي',
]);

const ORDINAL = new Map(
  Object.entries({ ...ORDINALS, ثالث: 3, تالت: 3, رابع: 4, خامس: 5, تاني: 2, first: 1, second: 2, third: 3, fourth: 4, awal: 1, tani: 2, thani: 2, talet: 3, thalith: 3 }).map(([k, v]) => [fold(k), v]),
);

/** Units whose number belongs in the name ("كيس رز ٥ كيلو"), and what comes
 * before a number that is part of a name ("مقاس ٤", "٥ ملغ"). */
const UNITS = set(['كيلو', 'كغ', 'كيلوغرام', 'غرام', 'جرام', 'ملغ', 'مل', 'لتر', 'kg', 'g', 'ml', 'mg']);
const NUMBER_IN_NAME_AFTER = set(['مقاس', 'رقم', 'size', 'نمره']);
/** Containers people put a count on: "٣ علب تونة" is three of "علبة تونة". */
const CONTAINER_SINGULAR: Map<string, string> = new Map(
  Object.entries({ علب: 'علبة', ربطات: 'ربطة', باكيتات: 'باكيت', كراتين: 'كرتون', قطع: 'قطعة', صحون: 'صحن', اكياس: 'كيس', قناني: 'قنينة', جالونات: 'جالون', اسطوانات: 'اسطوانة' }).map(([k, v]) => [fold(k), v]),
);
const CONTAINERS = set(['علبه', 'علب', 'ربطه', 'باكيت', 'كرتون', 'كرتونه', 'قطعه', 'صحن', 'كيس', 'قنينه', 'جالون', 'اسطوانه', 'جره', 'كاس', 'كوب', 'شريط', 'بوكس', 'box']);
/** The words that undo a number: "٢ لا لا تلاتة", "٥ لا خليها ٣". */
const CORRECTION_FILLER = set(['لا', 'خليه', 'خليها', 'خليهم', 'خلي', 'خلها', 'خله', 'خلهم', 'بل', 'اقصد', 'يعني']);
/** Size units: the number before them is the size, not a count ("بيبسي ٢ لتر"). */
const SIZE_UNITS = set(['لتر', 'مل', 'ملغ', 'غرام', 'جرام', 'جم', 'ml', 'mg', 'g', 'l', 'ورقه', 'pack', 'اشخاص', 'شخص', 'نفر', 'انفار', 'قطع']);
/** "كبة ٦ حبات": a count after the item. */
const AFTER_COUNTERS = set(['حبه', 'حبات', 'حبة', 'pieces', 'pcs']);
const ORDER_VERB_SET = set(ORDER_VERBS.filter((v) => !v.includes(' ')));
const ORDER_VERB_PHRASES = ORDER_VERBS.filter((v) => v.includes(' ')).map((v) => fold(v).split(' '));
const BRANDS = ORDER_BRANDS.map((b) => fold(b).split(' ')).sort((a, b) => b.length - a.length);

/** Things that turn a message into a complaint about an order already
 * placed — never a new one. */
const COMPLAINT_RE = /(?:^|\s)(?:الغي|الغاء|استرجع|ارجع فلوسي|ارجعهن|ارجعه|ارجعها|ارجع|رجعلي|طلبي|طلبت|طلبيتي|وصلني بارد|وصلت بارده|تاخر|متاخر|ما وصل|الطلب اللي|اللي جاني|ناقص)(?=\s|$)/u;
/** Asking about an order rather than placing it: its price, delivery time, or Rico's opinion. */
const QUESTION_RE = /(?:^|\s)(?:كم ياخذ|كم بياخذ|كم سعر|بكم|وش رايك|شو رايك|برايك|تكفي|بتكفي|كم يكلف)(?=\s|$)/u;

/** "طلبي من البيك تأخر", "الغي طلبي": about an order already placed. The
 * app answers those itself; nothing here should search for the shop. */
export function isOrderComplaint(message: string): boolean {
  return COMPLAINT_RE.test(fold(message)) || QUESTION_RE.test(fold(message));
}

interface Tokens {
  raw: string[];
  folded: string[];
}

function tokenize(text: string): Tokens {
  const prepared = text
    .replace(DIACRITICS, '')
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/سوبر\s+ماركت/gu, 'سوبرماركت')
    // Separators become "و", so a list split by commas, "+", dashes or
    // numbered lines splits the same way.
    .replace(/[،,+\n\r;؛&—–]|\s-\s|\.\s|\d\)/g, ' و ')
    // "و٢", "٢كيلو": a number glued to a word is its own token.
    // Arabic letters only: Franco writes letters as digits ("a6lob", "za3tar").
    .replace(/([\u0600-\u06FF])(\d)/gu, '$1 $2')
    .replace(/(\d)([\u0600-\u06FF])/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const raw = prepared.split(/\s+/).filter(Boolean);
  return { raw, folded: raw.map(fold) };
}

function brandAt(folded: string[], i: number): number {
  for (const b of BRANDS) {
    if (b.every((w, k) => (folded[i + k] ?? '').replace(/^ال/u, '') === w.replace(/^ال/u, ''))) return b.length;
  }
  return 0;
}

function isVerbAt(folded: string[], i: number): number {
  for (const p of ORDER_VERB_PHRASES) if (p.every((w, k) => folded[i + k] === w)) return p.length;
  return ORDER_VERB_SET.has(folded[i]) ? 1 : 0;
}

/** A regular feminine dual ("كنافتين" → "كنافة") or a listed one. */
function dual(rawWord: string, word: string): { name: string | null } | null {
  if (DUALS.has(word)) return { name: DUALS.get(word)! };
  if (word.length >= 5 && word.endsWith('تين') && !NOT_DUAL.has(word)) return { name: rawWord.slice(0, -3) + 'ة' };
  return null;
}

/** "دفترين", "بالونين": a masculine dual whose singular is something sold. */
function masculineDual(rawWord: string, word: string, deps: OrderDeps): { name: string | null } | null {
  if (word.length < 5 || !word.endsWith('ين')) return null;
  const stem = word.slice(0, -2);
  return deps.isProduct(stem) ? { name: rawWord.slice(0, -2) } : null;
}

interface Item {
  name: string;
  quantity: number;
}

/** "٣ مسحب حار و٢ بيبسي" → two items. A number sets the quantity of what
 * follows it — or of what came before, when it closes an item ("شاورما ٣"). */
function parseItems(raw: string[], folded: string[], deps: OrderDeps): Item[] {
  const items: Item[] = [];
  let qty: number | null = null;
  let words: string[] = [];
  const flush = () => {
    if (words.length) items.push({ name: words.join(' '), quantity: qty ?? 1 });
    words = [];
    qty = null;
  };
  for (let i = 0; i < folded.length; i++) {
    const t = folded[i];
    const next = folded[i + 1];
    if (FILLER.has(t) || WANTS.has(t) || ORDER_VERB_SET.has(t)) continue;
    // "كيلو ونص", "نص خضار ونص بيبروني": a half joins the item it follows —
    // unless a unit follows it ("بسبوسة ونص كيلو معمول" is a second item).
    const afterHalf = t === 'و' ? folded[i + 2] : next;
    if (words.length && (t === 'ونص' || (t === 'و' && next === 'نص')) && !UNITS.has(afterHalf ?? '')) {
      words.push('ونص');
      if (t === 'و') i++;
      continue;
    }
    // "صحن واحد", "بيبسي وحدة": "one" after an item is no count at all.
    if (words.length && (t === 'واحد' || t === 'وحده')) continue;
    // "٧ اب": 7up.
    if (/^\d+$/u.test(t) && (next === 'اب' || next === 'up')) {
      words.push(`${raw[i]} ${raw[i + 1]}`);
      i++;
      continue;
    }
    // "...لو سمحت" is politeness, not a condition.
    if (t === 'لو' && next === 'سمحت') {
      i++;
      continue;
    }
    // "٢ لا خليه واحد", "اثنين لا لا ثلاثة" — the customer corrected the number.
    if (t === 'لا') {
      let j = i + 1;
      while (j < folded.length && CORRECTION_FILLER.has(folded[j])) j++;
      const n = /^\d+$/u.test(folded[j] ?? '') ? Number(folded[j]) : NUMBERS.get(folded[j] ?? '');
      if (n) {
        if (words.length) qty = n;
        else if (items.length) items[items.length - 1].quantity = n;
        i = j;
        if (folded[i + 1] === 'بس') i++;
        // "٢ مظبي دجاج.. لا خلها ٢ لحم": the correction names a new item.
        if (!words.length && items.length && folded[i + 1] && !folded[i + 1].startsWith('و') && !STOP.has(folded[i + 1])) {
          const last = items.pop()!;
          qty = last.quantity;
        }
        continue;
      }
      // "دخان؟ لا لا، بدي ٢ خبز": the customer took the item back.
      if (WANTS.has(folded[j] ?? '') || ORDER_VERB_SET.has(folded[j] ?? '') || folded[j] === 'و') {
        if (words.length) words = [];
        else items.pop();
        qty = null;
        i = j - 1;
        continue;
      }
    }
    // A delivery note or who it's for ("للمكتب", "للشباب") closes nothing and names nothing.
    if (t.startsWith('لل') && t.length > 3) continue;
    // "panadol night x2"
    const times = /^x(\d+)$/u.exec(t);
    if (times && words.length) {
      qty = Math.min(99, Number(times[1]));
      flush();
      continue;
    }
    const n = /^\d+$/u.test(t) ? Math.min(99, Math.max(1, Number(t))) : NUMBERS.get(t);
    if (n !== undefined) {
      // "مقاس ٤", "كيس رز ٥ كيلو", "كونكور ٥ ملغ": the number describes the item.
      const prev = folded[i - 1] ?? '';
      // "بيبسي ٢ لتر", "منسف ع ٤ اشخاص", "بروست ٤ قطع": a size, not a count.
      if (words.length && SIZE_UNITS.has(next ?? '')) {
        words.push(raw[i], raw[i + 1]);
        i++;
        continue;
      }
      // "كبة ٦ حبات": the count comes after the item, with a counter.
      if (words.length && AFTER_COUNTERS.has(next ?? '')) {
        qty = n;
        i++;
        flush();
        continue;
      }
      // "فيتامين د ٥٠٠٠", "بروفين ٤٠٠", "ايفون ١٥": a big number after an item
      // is part of its name.
      if (words.length && /^\d+$/u.test(t) && Number(t) > 12) {
        words.push(raw[i]);
        continue;
      }
      if (words.length && /^\d+$/u.test(t) && (NUMBER_IN_NAME_AFTER.has(prev) || (UNITS.has(next ?? '') && words.some((w) => CONTAINERS.has(fold(w)))))) {
        words.push(raw[i]);
        if (UNITS.has(next ?? '')) words.push(raw[++i]);
        continue;
      }
      // "موز ٢ كيلو", "سكر ٢ كيس": two kilos of bananas, two bags of sugar.
      if (words.length && (UNITS.has(next ?? '') || CONTAINERS.has(next ?? ''))) {
        words.unshift(raw[i + 1]);
        qty = n;
        i++;
        flush();
        continue;
      }
      const closesNext = next === undefined || next === 'و' || next === 'and' || next === 'w' || STOP.has(next) || (next.startsWith('و') && next.length > 2 && !VAW_WORDS.has(next)) || next === 'لا';
      const closes = words.length && qty === null && closesNext;
      if (closes) {
        qty = n;
        flush();
      } else {
        flush();
        qty = n;
      }
      continue;
    }
    if (t === 'و' || t === 'and' || t === 'w') {
      flush();
      continue;
    }
    // "وبيبسي" is "and Pepsi"; "وجبة" and "وسط" are words of their own.
    if (t.length > 2 && t.startsWith('و') && !VAW_WORDS.has(t)) {
      flush();
      const rest = t.slice(1);
      const n2 = NUMBERS.get(rest);
      if (n2 !== undefined) {
        qty = n2;
        continue;
      }
      const d2 = dual(raw[i].slice(1), rest);
      if (d2) {
        qty = 2;
        if (d2.name) words.push(d2.name);
        continue;
      }
      words.push(raw[i].slice(1));
      continue;
    }
    const d = dual(raw[i], t) ?? masculineDual(raw[i], t, deps);
    if (d) {
      // "ابي من البيك وجبتين": two meals, nothing more said.
      if (!d.name && !words.length && (next === undefined || next === 'و' || STOP.has(next))) {
        words.push(t === fold('حبتين') ? 'حبة' : 'وجبة');
        qty = 2;
        flush();
        continue;
      }
      // "بنادول اكسترا علبتين" — a count closing the item it follows.
      const closing = words.length && (next === undefined || next === 'و' || STOP.has(next) || (next.startsWith('و') && !VAW_WORDS.has(next)));
      if (closing) {
        if (d.name) words.unshift(d.name);
        qty = 2;
        flush();
        continue;
      }
      if (words.length) flush();
      qty = 2;
      if (d.name) words.push(d.name);
      continue;
    }
    if (!words.length && COUNTERS.has(t) && i + 1 < folded.length) continue;
    // "٣ علب تونة" → three "علبة تونة".
    if (!words.length && CONTAINER_SINGULAR.has(t)) {
      words.push(CONTAINER_SINGULAR.get(t)!);
      continue;
    }
    words.push(raw[i]);
  }
  flush();
  return items.filter((it) => it.name.trim());
}

interface Shop {
  placeName: string | null;
  category: string | null;
  position: number | null;
  /** Tokens the shop took up, from its first. */
  length: number;
  /** How it was named. Without an order verb only a real shop counts: a
   * brand, "مطعم X", or a list position — "من الرياض" is a city. */
  kind: 'position' | 'any' | 'brand' | 'named' | 'kind' | 'bare' | 'latin';
}

/** Reads the shop that starts at [i]: a list position, a kind of shop
 * nearby, a known brand, a shop noun with its name, or a bare name. */
function parseShop(tok: Tokens, i: number, deps: OrderDeps): Shop | null {
  const { raw, folded } = tok;
  const t = folded[i];
  if (!t) return null;

  const ordinal = ORDINAL.get(t) ?? (SHOP_NOUNS.has(t.replace(/^ال/u, '')) ? ORDINAL.get(folded[i + 1] ?? '') : undefined);
  if (ordinal) return { placeName: null, category: null, position: ordinal, length: ORDINAL.has(t) ? 1 : 2, kind: 'position' };
  // "min el awal": Franco's article before the position.
  if ((t === 'el' || t === 'al') && ORDINAL.has(folded[i + 1] ?? '')) {
    return { placeName: null, category: null, position: ORDINAL.get(folded[i + 1])!, length: 2, kind: 'position' };
  }
  // "من رقم ٢", "the second one".
  if ((t === 'رقم' || t === 'the') && (ORDINAL.has(folded[i + 1] ?? '') || /^\d$/u.test(folded[i + 1] ?? ''))) {
    const pos = ORDINAL.get(folded[i + 1]) ?? Number(folded[i + 1]);
    const len = folded[i + 2] === 'one' || folded[i + 2] === 'واحد' ? 3 : 2;
    return { placeName: null, category: null, position: pos, length: len, kind: 'position' };
  }

  // "اي مطعم", "اقرب فرن", "any cafe".
  if (ANY_SHOP.has(t)) {
    // "اي محل جوالات", "شي محل شاورما": the kind is the word after "محل".
    if (folded[i + 1] === 'محل' && folded[i + 2]) {
      return { placeName: null, category: deps.categoryOf(`${raw[i + 1]} ${raw[i + 2]}`) ?? deps.categoryOf(raw[i + 2]), position: null, length: 3, kind: 'any' };
    }
    let len = 2;
    if (folded[i + 2] === 'شوب' || folded[i + 2] === 'shop') len++;
    // "اقرب فرن قريب", "اقرب مطعم بخاري ٢ رز": what describes the kind.
    if (NEARBY.has(folded[i + len] ?? '')) len++;
    else if (folded[i + len] && /^\d/u.test(folded[i + len + 1] ?? '') && !/^\d/u.test(folded[i + len])) len++;
    return { placeName: null, category: deps.categoryOf(raw.slice(i + 1, i + 2).join(' ')), position: null, length: len, kind: 'any' };
  }

  let brand = brandAt(folded, i);
  // "لولو هايبر", "كارفور سيتي مول": a branch name after the brand.
  while (brand && BRANCH_WORDS.has(folded[i + brand] ?? '')) brand++;
  if (brand) return { placeName: raw.slice(i, i + brand).join(' '), category: null, position: null, length: brand, kind: 'brand' };

  const bare = t.replace(/^ال/u, '');
  if (SHOP_NOUNS.has(bare)) {
    // "مطعم البيك", "صيدلية النهدي": the noun, then the brand.
    const after = brandAt(folded, i + 1);
    if (after) return { placeName: raw.slice(i, i + 1 + after).join(' '), category: null, position: null, length: 1 + after, kind: 'brand' };

    // "كوفي شوب قريب": the noun's own second word.
    const shopWord = folded[i + 1] === 'شوب' || folded[i + 1] === 'shop' ? 1 : 0;
    // "مطعم قريب (علي)": a kind of shop, not a name.
    if (NEARBY.has(folded[i + 1 + shopWord] ?? '')) {
      const len = (NEARBY_TAIL.has(folded[i + 2 + shopWord] ?? '') ? 3 : 2) + shopWord;
      return { placeName: null, category: deps.categoryOf(raw[i]), position: null, length: len, kind: 'any' };
    }
    if (NEARBY.has(folded[i + 1] ?? '')) {
      const len = NEARBY_TAIL.has(folded[i + 2] ?? '') ? 3 : 2;
      return { placeName: null, category: deps.categoryOf(raw[i]), position: null, length: len, kind: 'any' };
    }

    // The name: words after the noun until the basket starts. The first is
    // taken even when it looks like food ("مطعم البخاري"); later ones only
    // when they don't.
    let len = 1;
    while (len < 4) {
      const w = folded[i + len];
      if (!w || STOP.has(w) || FILLER.has(w) || WANTS.has(w) || NOT_NAME.has(w) || w === 'و' || /^\d/u.test(w) || NUMBERS.has(w) || dual(raw[i + len], w)) break;
      if (w.startsWith('و') && w.length > 2 && !VAW_WORDS.has(w)) break;
      if (len > 1 && deps.isProduct(w) && !NAME_LINKS.has(folded[i + len - 1])) break;
      // A third word only when the name clearly runs on ("ابو احمد", "الفلافل الذهبي").
      if (len >= 2 && !w.startsWith('ال') && !NAME_LINKS.has(folded[i + len - 1])) break;
      // "الصيدلية" with no name after it is "the pharmacy" — any of them.
      if (len === 1 && t.startsWith('ال') && !w.startsWith('ال')) break;
      // "صيدلية فيفادول", "ملحمة كيلو لحمة": a product or a unit after the
      // noun is the basket, not the name. A definite word is still a name
      // ("مطعم البخاري").
      // "محل ورد", "محل حيوانات": the kind of shop, named by what it sells —
      // unless a name follows ("محل هدايا ريحانة").
      if (len === 1 && (bare === 'محل' || bare === 'محلات')) {
        const category = deps.categoryOf(`${raw[i]} ${raw[i + 1]}`);
        if (category) {
          const n2 = folded[i + 2];
          const named = n2 && !STOP.has(n2) && !FILLER.has(n2) && !WANTS.has(n2) && !/^\d/u.test(n2) && !NUMBERS.has(n2) && !dual(raw[i + 2], n2) && !deps.isProduct(n2) && !n2.startsWith('و') && !CONTAINERS.has(n2) && !UNITS.has(n2);
          if (named) return { placeName: raw.slice(i, i + 3).join(' '), category: null, position: null, length: 3, kind: 'named' };
          return { placeName: null, category, position: null, length: 2, kind: 'kind' };
        }
      }
      if (len === 1 && !w.startsWith('ال') && (deps.isProduct(w) || UNITS.has(w) || CONTAINERS.has(w) || CONTAINER_SINGULAR.has(w))) {
        // "محمص قهوة الهيل": a product word, then a definite name, is the
        // shop's name.
        const n2 = folded[i + 2] ?? '';
        if (deps.isProduct(w) && n2.startsWith('ال') && !deps.isProduct(n2)) len = 3;
        // "مطعم بيتزا قريب": the kind of shop, described, nearby.
        else if (NEARBY.has(n2)) return { placeName: null, category: deps.categoryOf(`${raw[i]} ${raw[i + 1]}`), position: null, length: 3, kind: 'kind' };
        break;
      }
      len++;
    }
    if (len === 1) return { placeName: null, category: deps.categoryOf(raw[i]), position: null, length: 1, kind: 'kind' };
    return { placeName: raw.slice(i, i + len).join(' '), category: null, position: null, length: len, kind: 'named' };
  }

  // A bare name: one word, or two when they belong together ("ابو جبارة",
  // "ريم البوادي", "كنافة حبيبة", "shawarma house").
  if (FILLER.has(t) || STOP.has(t) || /^\d/u.test(t) || NUMBERS.has(t)) return null;
  // "mn mat3am", "from supermarket": a kind of shop typed as a word.
  const kindOf = LATIN_KINDS.has(t) ? deps.categoryOf(raw[i]) : null;
  if (kindOf) return { placeName: null, category: kindOf, position: null, length: 1, kind: 'kind' };
  let len = 1;
  const n1 = folded[i + 1];
  if (n1 && !STOP.has(n1) && !FILLER.has(n1) && !/^\d/u.test(n1) && !NUMBERS.has(n1) && !dual(raw[i + 1], n1) && n1 !== 'و' && n1 !== 'w') {
    if (NAME_LINKS.has(t) || (n1.startsWith('ال') && !deps.isProduct(n1)) || (deps.isProduct(t) && !deps.isProduct(n1)) || /^[a-z0-9]+$/u.test(n1) && /^[a-z0-9]+$/u.test(t) && !['and', 'w'].includes(n1)) len = 2;
  }
  // "غاز ابو صالح": a link word pulls in the name after it.
  if (len === 2 && NAME_LINKS.has(n1) && folded[i + 2] && !/^\d/u.test(folded[i + 2])) len = 3;
  return { placeName: raw.slice(i, i + len).join(' '), category: null, position: null, length: len, kind: /^[a-z]/u.test(t) ? 'latin' : 'bare' };
}

/**
 * يقرأ الطلب من الرسالة، أو null إذا ما فيها طلب.
 *
 * طلب = محل (باسمه، أو بنوعه مع أصناف، أو برقمه بآخر قائمة) + أصناف.
 * "وصلني من مطعم" بلا أصناف ولا اسم مش طلب — هذا بحث عن مطاعم، والمستدعي
 * يكمل فيه.
 */
export function parseOrder(message: string, deps: OrderDeps): ParsedOrder | null {
  // "طلبي من البيك تأخر" is about an order already placed.
  const folded0 = fold(message);
  const complaint = COMPLAINT_RE.exec(folded0);

  // "التميمي: موز ٢ كيلو، تفاح" — a shop, a colon, a list.
  const colon = message.indexOf(':');
  let text = message;
  let colonShop = false;
  const headWords = message.slice(0, colon).trim().split(/\s+/);
  if (colon > 0 && colon < 50 && headWords.length <= 6 && !/(?:^|\s)من\s/u.test(message.slice(colon + 1))) {
    const fromIdx = headWords.lastIndexOf('من');
    const head = fromIdx >= 0 ? headWords.slice(fromIdx + 1).join(' ') : headWords.join(' ').replace(/^(?:بدي|ابي|ابغى|بدنا)?\s*(?:اغراض|غراض|مقاضي)?\s*/u, '');
    text = `من ${head} ${message.slice(colon + 1)}`;
    colonShop = true;
  }

  const tok = tokenize(text);
  const { raw, folded } = tok;
  if (!folded.length) return null;

  // Where the order verb is, if there is one.
  let verbAt = -1;
  let verbLen = 0;
  for (let i = 0; i < folded.length; i++) {
    const v = isVerbAt(folded, i);
    if (v) {
      verbAt = i;
      verbLen = v;
      break;
    }
  }
  const wantAt = folded.findIndex((t) => WANTS.has(t));
  // The first word that isn't a greeting or a "please".
  let leadAt = 0;
  while (leadAt < folded.length && (OPENERS.has(folded[leadAt]) || folded[leadAt] === 'و')) leadAt++;
  if (complaint && (verbAt < 0 || complaint.index < folded.slice(0, verbAt).join(' ').length)) return null;
  if (verbAt < 0 && QUESTION_RE.test(folded0)) return null;

  // "من" followed by something that reads as a shop.
  let fromAt = -1;
  let shop: Shop | null = null;
  for (let i = 0; i < folded.length - 1; i++) {
    if (!FROM.has(folded[i])) continue;
    // "من ستار.. لا لا من دانكن": the customer corrected the shop.
    if (shop && !folded.slice(fromAt + 1, i).includes('لا')) break;
    const s = parseShop(tok, i + 1, deps);
    if (s) {
      fromAt = i;
      shop = s;
    }
  }

  // No "من": a brand at the very start with a basket after it ("البيك ٢
  // مسحب", "حبيبة كنافة"), or a verb with only items ("اطلبلي منسف لخمسة").
  if (!shop) {
    // "الاول، ابغى منه ٦ كرواسون": a listed shop, then "from it".
    const ord = ORDINAL.get(folded[0]);
    const fromIt = folded.findIndex((t) => t === 'منه' || t === 'منهم' || t === 'منها');
    if (ord && fromIt > 0) {
      const items = parseItems(raw.slice(fromIt + 1), folded.slice(fromIt + 1), deps);
      const order = validateIntent({ kind: 'order', referencedPosition: ord, orderItems: items });
      return order ? { order, rest: '' } : null;
    }
    // "ابي ملحمة توصل لي ٣ كيلو لحم": a kind of shop that should bring something.
    const bring = folded.findIndex((t, k) => k > 0 && BRING.has(t) && SHOP_NOUNS.has(folded[k - 1].replace(/^ال/u, '')));
    if (bring > 0 && (wantAt >= 0 || verbAt >= 0)) {
      const items = parseItems(raw.slice(bring + 1), folded.slice(bring + 1), deps);
      const category = deps.categoryOf(raw[bring - 1]);
      const order = items.length && category ? validateIntent({ kind: 'order', category, orderItems: items }) : null;
      if (order) return { order, rest: '' };
    }
    // "البيك ٢ مسحب", "مطعم البيك ٢ مسحب", "حلويات نفيسة. ٢ كيلو كنافة",
    // "اي مطعم قريب، ابي ٤ شاورما": the shop leads, then a basket.
    const leadShop = parseShop(tok, leadAt, deps);
    // A kind of shop leading the message ("بقالة قريبة ابي حليب", "محل
    // حيوانات بدي اكل قطط") is a place to find; only "اي مطعم" picks
    // whichever shop, and only a brand or a counted basket makes the rest an order.
    const pickAny = leadShop?.kind === 'any' && ANY_PICK.has(folded[leadAt]);
    if (leadShop && (leadShop.kind === 'brand' || leadShop.kind === 'named' || pickAny) && leadAt + leadShop.length < folded.length) {
      let k = leadAt + leadShop.length;
      while (k < folded.length && (WANTS.has(folded[k]) || NEARBY.has(folded[k]) || folded[k] === 'و' || isVerbAt(folded, k))) k += Math.max(1, isVerbAt(folded, k));
      const startsCounted = /^\d/u.test(folded[k] ?? '') || NUMBERS.has(folded[k] ?? '') || !!dual(raw[k] ?? '', folded[k] ?? '');
      const items = parseItems(raw.slice(k), folded.slice(k), deps);
      if (items.length && (startsCounted || leadShop.kind === 'brand' || verbAt > leadAt)) {
        const order =
          leadShop.kind === 'any'
            ? validateIntent({ kind: 'order', category: leadShop.category ?? deps.categoryOf(items.map((it) => it.name).join(' ')), orderItems: items })
            : validateIntent({ kind: 'order', placeName: leadShop.placeName, orderItems: items });
        if (order) return { order, rest: '' };
      }
    }
    if (verbAt < 0 || folded.some((t) => WHERE.has(t))) return null;
    const items = parseItems(raw.slice(verbAt + verbLen), folded.slice(verbAt + verbLen), deps);
    // "جيبلي اقرب مخبز" names a shop to find, not something to buy.
    if (items.every((it) => fold(it.name).split(' ').some((w) => ANY_SHOP.has(w) || SHOP_NOUNS.has(w.replace(/^ال/u, ''))))) return null;
    const category = deps.categoryOf(items.map((it) => it.name).join(' '));
    const order = items.length && category ? validateIntent({ kind: 'order', category, orderItems: items }) : null;
    return order ? { order, rest: '' } : null;
  }

  // An order needs to say so. An order verb says it outright. Without one —
  // a want ("ابي من…"), the shop leading ("من الدانوب ابي…"), a count first
  // ("٢ كابتشينو من ستاربكس"), the colon form — "من" is far more often
  // "from" ("من الرياض لجدة", "قريب من المطار", "من يومين"), so the shop has
  // to be a real one and there has to be something to put in the basket.
  if (verbAt < 0) {
    const firstIsCount = /^\d/u.test(folded[0]) || NUMBERS.has(folded[0]) || !!dual(raw[0], folded[0]);
    const cue = wantAt >= 0 || fromAt === 0 || colonShop || firstIsCount;
    const realShop = shop.kind === 'brand' || shop.kind === 'named' || shop.kind === 'position' || (colonShop && shop.kind !== 'bare');
    // "ابي عشرين وردة من اي محل ورد": a kind of shop is enough once the
    // customer has counted what they want.
    // Whole numbers only: Franco spells letters with digits ("sa2f").
    const counted = folded.some((t) => /^\d+$/u.test(t) || NUMBERS.has(t) || !!dual(t, t) || t === 'نص' || t === 'ربع');
    // The same for a name typed in Latin letters ("mn shawarma house ٢ صحن")
    // — without a count, "from jeddah" is a city.
    const kindWithCount = (shop.kind === 'any' || shop.kind === 'kind' || shop.kind === 'latin') && counted;
    // "من اي سوبرماركت ابي حليب…": "any" is a choice of shop, never a place.
    const anyShop = shop.kind === 'any';
    // "مرحبا، من غاز العتيبي جرة غاز": opening with "من" names the shop,
    // whatever its name.
    const opensWithFrom = fromAt === leadAt;
    // "حمص وفول… كلهم من مطعم هاشم": a list, then a real shop.
    const listThenShop = fromAt > leadAt && (shop.kind === 'brand' || shop.kind === 'named');
    if (!(cue && (realShop || kindWithCount || anyShop)) && !opensWithFrom && !listThenShop) return null;
  }
  // "وين اطلب منسف" asks where; it isn't the order.
  if (folded.slice(0, fromAt).some((t) => WHERE.has(t))) return null;

  // The basket: what sits between the verb and "من", and what follows the shop
  // up to where a second request starts.
  // What's before "من" is the basket only when it reads like one. Without a
  // verb in front, a remark often is ("مرتي بتسلم عليك، بدها من…"): keep
  // what follows the last want, and only items that look counted or sold.
  let beforeStart = verbAt >= 0 && verbAt < fromAt ? verbAt + verbLen : leadAt;
  if (verbAt < 0 || verbAt > fromAt) {
    const lastWant = folded.slice(0, fromAt).map((t, k) => (WANTS.has(t) ? k : -1)).filter((k) => k >= 0).pop();
    if (lastWant !== undefined) beforeStart = lastWant + 1;
  }
  const before = parseItems(raw.slice(beforeStart, fromAt), folded.slice(beforeStart, fromAt), deps).filter(
    (it) => verbAt >= 0 && verbAt < fromAt ? true : it.quantity > 1 || fold(it.name).split(' ').some((w) => deps.isProduct(w)),
  );
  const afterStart = fromAt + 1 + shop.length;
  let afterEnd = folded.length;
  for (let i = afterStart; i < folded.length; i++) {
    if (STOP.has(folded[i]) && !(folded[i] === 'لو' && folded[i + 1] === 'سمحت')) {
      afterEnd = i;
      break;
    }
    // "…وبدي كمان سباك": a want after the basket has started is a new request.
    if (i > afterStart + 1 && WANTS.has(folded[i]) && folded.slice(afterStart, i).some((t) => !FILLER.has(t) && !WANTS.has(t) && !isVerbAt(folded, folded.indexOf(t)))) {
      afterEnd = i;
      break;
    }
  }
  // Skip a verb that comes after the shop ("من الدانوب ابي حليب…").
  let a = afterStart;
  while (a < afterEnd && (WANTS.has(folded[a]) || NEARBY.has(folded[a]) || isVerbAt(folded, a))) a += Math.max(1, isVerbAt(folded, a));
  const after = parseItems(raw.slice(a, afterEnd), folded.slice(a, afterEnd), deps);
  const items = [...before, ...after];
  const rest = raw.slice(afterEnd).join(' ');

  if (verbAt < 0 && !items.length) return null;

  let order: Intent | null = null;
  if (shop.position) order = validateIntent({ kind: 'order', referencedPosition: shop.position, orderItems: items });
  else if (shop.placeName) order = validateIntent({ kind: 'order', placeName: shop.placeName, orderItems: items });
  else if (items.length) {
    const category = shop.category ?? deps.categoryOf(items.map((it) => it.name).join(' '));
    if (category) order = validateIntent({ kind: 'order', category, orderItems: items });
  }
  return order ? { order, rest } : null;
}
