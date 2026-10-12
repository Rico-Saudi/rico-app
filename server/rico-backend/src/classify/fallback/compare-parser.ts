// "قارن لي وين أرخص جبنة", "مين أرخص بالشاورما؟" — the customer wants one
// product's price across the shops nearby.
//
// Read before the order parser, which would take "بدي اشتري جبنة… وين ارخص
// جبنة" for an order ("اشتري" is an order verb), and before the keyword
// table, which would answer it with the cheapest supermarket — a shop, not
// the cheese they asked about.
//
// Deliberately narrow: it needs a comparison cue ("قارن", or "أرخص" with
// "وين"/"مين"), and gives up when what's left is a kind of shop ("وين أرخص
// مطعم") — that is a place search, and the keyword table answers it.

import { normalizeArabic } from '../../learning/constants/normalize';
import { Intent, validateIntent } from '../intent-validation';

/** Sets of folded words — written in the usual spelling, matched folded. */
const folded = (words: string[]) => new Set(words.map((w) => normalizeArabic(w)));

const COMPARE_VERBS = folded([
  'قارن', 'قارني', 'قارنلي', 'قارنها', 'قارنهم', 'نقارن', 'تقارن', 'مقارنه', 'مقارنات', 'compare',
]);

const CHEAPEST = folded(['ارخص', 'الارخص', 'اوفر', 'الاوفر']);

/** "وين"/"مين"/"اي محل": asking *which shop*, which is what makes "أرخص X" a comparison. */
const WHICH_SHOP = folded(['وين', 'فين', 'وينه', 'مين', 'انهي', 'اي', 'عند']);

/** Words around the product that aren't part of it. */
const FILLER = folded([
  'ريكو', 'يا', 'بدي', 'ابي', 'ابغى', 'ابغا', 'ابغي', 'اريد', 'نبي', 'بدنا', 'ودي', 'حاب', 'اشتري', 'نشتري', 'اشتريه',
  'اشتريها', 'اجيب', 'نجيب', 'اخذ', 'اشوف', 'شوف', 'شوفلي', 'قلي', 'قول', 'خبرني', 'دور', 'دورلي', 'ابحث', 'القى', 'الاقي',
  'بلاقي', 'نلاقي', 'القاه', 'القاها', 'احصل', 'ايش', 'وش', 'شو', 'محل', 'محلات', 'المحلات', 'مكان', 'الاماكن', 'عندهم',
  'عنده', 'بين', 'في', 'فيه', 'هو', 'هي', 'اللي', 'الي', 'يكون', 'تكون', 'اقل', 'احسن', 'سعر', 'سعره', 'سعرها', 'اسعار',
  'الاسعار', 'اسعاره', 'اسعارها', 'بكم', 'كم', 'قديش', 'لي', 'لو', 'سمحت', 'من', 'فضلك', 'الله', 'يخليك', 'يبيع', 'تبيع',
  'يبيعون', 'بيبيع', 'ببيع', 'مني', 'قريب', 'قريبه', 'القريبه', 'القريب', 'حولي', 'جنبي', 'الحين', 'هلا', 'هلق', 'هسا',
  'يعني', 'طيب', 'تمام', 'price', 'prices', 'cheapest', 'the', 'of', 'where', 'is',
  ...COMPARE_VERBS, ...CHEAPEST, ...WHICH_SHOP,
]);

/** A kind of shop: "وين أرخص مطعم" asks for a place, not a product. */
const PLACE_NOUNS = folded([
  'مطعم', 'مطاعم', 'كافيه', 'كافيهات', 'كوفي', 'مقهى', 'صيدليه', 'صيدليات', 'بقاله', 'بقالات', 'سوبرماركت', 'سوبر', 'ماركت',
  'هايبر', 'مخبز', 'مخابز', 'فرن', 'متجر', 'فندق', 'فنادق', 'شقق', 'صراف', 'بنك', 'مستشفى', 'عياده', 'مستوصف', 'محطه',
  'بنزينه', 'مغسله', 'صالون', 'حلاق', 'جيم', 'نادي', 'مول', 'سوق', 'ملحمه', 'محمصه', 'مكتبه', 'شاليه', 'استراحه', 'ورشه',
  'كراج', 'مطبعه', 'restaurant', 'cafe', 'pharmacy', 'supermarket', 'hotel',
]);

/** "X ولا Y" — a choice between named things. */
const EITHER_OR = folded(['ولا', 'او', 'أو', 'ولّا', 'or']);

const MAX_ITEMS = 5;

export function parseCompare(message: string): Intent | null {
  // Raw words beside their folded form: the folded one decides, the raw one
  // is what's shown back ("أرخص جبنة", not "أرخص جبنه").
  const raw = (message ?? '').replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/u).filter(Boolean);
  if (raw.length === 0 || raw.length > 20) return null;
  const plain = raw.map((w) => normalizeArabic(w));

  const compares = plain.some((w) => COMPARE_VERBS.has(w));
  const cheapestWhere = plain.some((w) => CHEAPEST.has(w)) && plain.some((w) => WHICH_SHOP.has(w));
  if (!compares && !cheapestWhere) return null;
  // "مين ارخص، شاورما ريم ولا شاورما ابو جبارة؟" weighs two shops the
  // customer already has in mind — not one product across the area.
  if (plain.some((w) => EITHER_OR.has(w))) return null;

  // What's left between the filler words, one product per stretch.
  const items: string[][] = [];
  let current: string[] = [];
  const close = () => {
    if (current.length) items.push(current);
    current = [];
  };
  for (let i = 0; i < raw.length; i++) {
    let word = raw[i];
    let f = plain[i];
    // "والجبنة" after a product starts the next one.
    if (f.length > 3 && f.startsWith('و') && current.length && !FILLER.has(f)) {
      close();
      word = word.slice(1);
      f = f.slice(1);
    }
    // "مين أرخص بالشاورما" — the product, with "بال" in front.
    if (f.length > 5 && f.startsWith('بال')) {
      word = word.slice(3);
      f = f.slice(3);
    }
    if (FILLER.has(f) || f === 'و') {
      close();
      continue;
    }
    current.push(word);
  }
  close();

  const seen = new Set<string>();
  const names: string[] = [];
  for (const words of items) {
    const key = words.map((w) => normalizeArabic(w).replace(/^ال(?=.{2})/u, '')).join(' ');
    if (key.split(' ').some((w) => PLACE_NOUNS.has(w))) return null;
    if (seen.has(key)) continue;
    seen.add(key);
    // "الحليب" reads back as "حليب".
    const [head, ...rest] = words;
    names.push([head.replace(/^ال(?=.{2})/u, ''), ...rest].join(' '));
  }
  if (names.length === 0) return null;

  return validateIntent({
    kind: 'compare',
    orderItems: names.slice(0, MAX_ITEMS).map((name) => ({ name, quantity: 1 })),
  });
}
