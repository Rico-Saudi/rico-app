// "اتصل على مطعم الماهر", "وش رقم صيدلية النهدي", "كلّمهم" — the customer
// wants a shop's number, to call it themselves.
//
// Read before the rest of the keyword table, because that table would answer
// "اتصل على مطعم الماهر" with a search for restaurants: "مطعم" is a shop word,
// and the call is not.
//
// The name is cut from the message as typed, not from its folded form: the app
// searches shop names with it, and "صيدليه" (folded) doesn't match "صيدلية".

import { normalizeArabic } from '../../learning/constants/normalize';
import { Intent, validateIntent } from '../intent-validation';

/** "اتصل"/"كلّم"/"دق"/"رن" in the shapes people type them, folded. */
const CALL_VERBS = new Set([
  'اتصل', 'اتصلي', 'اتصلو', 'اتصلوا', 'تتصل', 'تتصلي', 'نتصل',
  'كلم', 'كلمي', 'كلملي', 'كلمهم', 'كلمه', 'كلمها', 'تكلملي',
  'دق', 'دقي', 'دقلي', 'دق لي', 'رن', 'رني', 'رنلي', 'call',
]);

/** "رقم"/"نمرة" — asking for the number is asking to call. */
const NUMBER_WORDS = new Set(['رقم', 'رقمه', 'رقمها', 'رقمهم', 'نمره', 'نمرته', 'نمرتهم', 'number']);

/** Words between the verb and the name that aren't part of the name. */
const LEADING_FILLER = new Set([
  'على', 'علي', 'عليهم', 'ب', 'مع', 'ل', 'لي', 'لنا', 'الي', 'الى', 'تلفون', 'تليفون', 'هاتف', 'جوال', 'موبايل', 'الجوال',
  'التلفون', 'الهاتف', 'المحل', 'المكان',
]);

/** Words after the name that aren't part of it: "اتصل على الماهر **الحين لو سمحت**". */
const TRAILING_FILLER = new Set([
  'الحين', 'هلا', 'هلأ', 'هلق', 'هسا', 'هسه', 'بسرعه', 'لو', 'سمحت', 'الله', 'يخليك', 'يعافيك', 'من', 'فضلك', 'please', 'pls', 'now',
]);

/** "ليش ما اتصلوا", "المحل اتصل علي": about a call, not a request for one. */
const NOT_A_REQUEST = new Set(['ما', 'ليش', 'لسا', 'لسه', 'ليه', 'مين', 'حدا', 'احد', 'محد', 'ماحد', 'ليتهم']);

/** What may come before "رقم" when it asks for a phone number. */
const ASKING = new Set([
  'وش', 'شو', 'ايش', 'اش', 'شنو', 'بدي', 'ابي', 'ابغي', 'ابغا', 'اريد', 'عطني', 'اعطيني', 'اعطني', 'ممكن', 'لو', 'سمحت', 'طيب', 'هات', 'ارسل', 'ارسلي', 'ابعتلي', 'بعتلي', 'what', 'whats', 'give', 'me', 'the',
]);

/** Pronouns that point at a shop already in the conversation. */
const PRONOUNS = new Set(['عليهم', 'عليه', 'عليها', 'فيهم', 'فيه', 'بهم', 'معهم', 'هم', 'رقمهم', 'رقمه', 'رقمها', 'نمرتهم', 'نمرته', 'كلمهم', 'كلمه', 'كلمها']);

/** Ordering in the same message makes it an order — Rico sends that itself. */
const ORDER_WORDS = /(?:^|\s)(?:و?اطلب\S*|و?وصي\S*|و?جهز\S*|و?خذ\s*لي|و?خدلي)(?:\s|$)/u;

/** Generic shop words that, alone, are a kind of shop and not a name. */
const GENERIC_SHOPS = new Set(['مطعم', 'كافيه', 'كوفي', 'صيدليه', 'محل', 'بقاله', 'سوبرماركت', 'مخبز', 'فرن', 'المطعم', 'الصيدليه', 'المحل', 'البقاله']);

export interface CallContext {
  /** Shops Rico just listed, in order. */
  shown: { position: number; name: string }[];
  /** "الثاني"/"الأخير" in the message, resolved against that list. */
  pointer: number | null;
  /** The shop the last turns were already about, when there is one. */
  focused: number | null;
}

export function parseCall(message: string, ctx: CallContext): Intent | null {
  const tokens = message.split(/\s+/u).filter(Boolean);
  const folded = tokens.map((t) => normalizeArabic(t));
  const text = folded.join(' ');
  if (ORDER_WORDS.test(text)) return null;

  // The call word has to lead the request: "اتصل على…", "لو سمحت كلّم…",
  // "وش رقم…". Deeper in the sentence it is usually narrating a call.
  const at = folded.findIndex((w, i) => i < 4 && (CALL_VERBS.has(w) || NUMBER_WORDS.has(w)));
  if (at < 0) return null;
  // "رقم" is a number of anything — a flight, an order, a position. It asks
  // for a shop's phone only when it opens the request ("رقم…", "وش رقم…",
  // "عطني رقم…").
  if (NUMBER_WORDS.has(folded[at]) && !folded.slice(0, at).every((w) => ASKING.has(w))) return null;
  if (folded.slice(0, at).some((w) => NOT_A_REQUEST.has(w))) return null;
  // "اتصل علي" / "كلمني": call *me* — not a shop.
  if (/^(?:علي|عليا|فيني|ني|بي)$/u.test(folded[at + 1] ?? '') && folded.length <= at + 2) return null;

  if (ctx.pointer) return onTheList(ctx.pointer, ctx);

  let start = at + 1;
  while (start < tokens.length && LEADING_FILLER.has(folded[start])) start++;
  let end = tokens.length;
  while (end > start && TRAILING_FILLER.has(folded[end - 1])) end--;

  // Nothing named: "كلّمهم", "اتصل عليهم", "وش رقمهم".
  if (start >= end) {
    const pointsBack = PRONOUNS.has(folded[at]) || folded.slice(at + 1).some((w) => PRONOUNS.has(w));
    return pointsBack && ctx.focused ? onTheList(ctx.focused, ctx) : null;
  }

  // "اتصل بمطعم الماهر": the preposition is glued to the name.
  const named = tokens.slice(start, end);
  if (/^[بل](?=ال|مطعم|كافي|كوفي|صيدلي|محل|بقال|مخبز|فرن)/u.test(folded[start])) named[0] = named[0].slice(1);
  const name = named.join(' ').replace(/[؟?!.,،]+$/u, '').trim();
  // "رقم ٢" is a position or a quantity, not a shop.
  if (!/\p{L}/u.test(name) || GENERIC_SHOPS.has(normalizeArabic(name))) return null;
  return validateIntent({ kind: 'call', placeName: name });
}

function onTheList(position: number, ctx: CallContext): Intent | null {
  const shop = ctx.shown.find((s) => s.position === position);
  return validateIntent({ kind: 'call', referencedPosition: position, placeName: shop?.name ?? null });
}
