import { tokenize } from './order-matching.util';

// Every word below is written the way it is spelled, then folded through the
// same tokenizer the menu goes through. Hand-normalizing them instead is a
// standing bug: "أحلى" folds to "احلي" (ى→ي), and a set written with "احلى"
// silently matches nothing.
const fold = (words: string[]) => new Set(words.flatMap((w) => tokenize(w)));

// "بدي وصي من مطعم الماهر وجبة" — the customer named the shop but not a
// dish. "وجبة" is not something to look up on the menu; it is the customer
// handing the choice over. Matching it as a name is what produced the wrong
// answer before: a real order, from a real shop, answered with "ما لقيت
// وجبة عندهم" while a full menu sat there unread.
//
// This decides only whether a requested name IS such a hand-over. What to
// pick once it is, is PublicService.pickForCustomer.

/** Nouns that stand in for "something off your menu". */
const GENERIC_NOUNS = fold([
  'وجبه',
  'وجبات',
  'اكله',
  'اكلات',
  'اكل',
  'ماكوله',
  'طعام',
  'غداء',
  'عشاء',
  'فطور',
  'شي',
  'شيء',
  'حاجه',
  'طلب',
  'طلبيه',
]);

/**
 * "اللي تشوفه" — a hand-over with no noun in it at all. Counted as if it
 * named one, because that is exactly what it does.
 */
const HANDOVER_VERBS = fold(['تشوفه', 'تشوفها', 'تشوف', 'تنصح', 'تنصحني', 'تختاره', 'تختارها', 'يعجبك', 'تحبه']);

/** "أرخص وجبة" — a hand-over with a budget attached. */
const CHEAP_QUALIFIERS = fold(['ارخص', 'رخيصه', 'رخيص', 'اوفر', 'اقتصاديه', 'اقتصادي', 'بسيطه', 'بسيط']);

/** "أحلى وجبة" — a hand-over asking for their best, not their cheapest. */
const BEST_QUALIFIERS = fold([
  'احلى',
  'افضل',
  'اطيب',
  'اشهر',
  'احسن',
  'مشهوره',
  'مشهور',
  'مميزه',
  'مميز',
  'حلوه',
  'حلو',
  'طيبه',
  'زينه',
]);

/** Words that carry no choice either way and must not block the reading. */
const FILLERS = fold([
  'اي',
  'من',
  'عندك',
  'عندكم',
  'عندهم',
  'عندهن',
  'لو',
  'سمحت',
  'لي',
  'الي',
  'اللي',
  'فيه',
  'في',
  'واحده',
  'وحده',
  'واحد',
  'كويسه',
  'كويس',
  'منيحه',
  'منيح',
]);

export type PickPreference = 'cheapest' | 'best' | 'any';

export interface GenericItemReading {
  /** The customer named no dish — Rico should choose one. */
  isGeneric: boolean;
  /** Which way to lean when choosing. */
  prefer: PickPreference;
}

const NOT_GENERIC: GenericItemReading = { isGeneric: false, prefer: 'any' };

/** Drops a leading "و" only when what's left is a word we know — so "وجبة"
 * is never mistaken for "و" + "جبة". */
function stripConjunction(token: string): string {
  if (!token.startsWith('و') || token.length < 3) return token;
  const rest = token.slice(1);
  return GENERIC_NOUNS.has(rest) || CHEAP_QUALIFIERS.has(rest) || BEST_QUALIFIERS.has(rest) || HANDOVER_VERBS.has(rest)
    ? rest
    : token;
}

/**
 * Reads a requested item name as either a real dish or a hand-over.
 *
 * Strict on purpose: EVERY word has to be a generic noun, a qualifier or a
 * filler. One word that isn't — "وجبة عائلية", "وجبة أطفال" — means the
 * customer did name something, and it goes down the normal matching path
 * where a menu row called "وجبة عائلية" is found properly.
 *
 * Callers must still try a normal match first. A shop whose menu genuinely
 * has a row called "وجبة" should serve that row, not a pick; only when the
 * menu has nothing by that name does the hand-over reading apply.
 */
export function readGenericItem(name: string): GenericItemReading {
  const tokens = tokenize(name);
  if (tokens.length === 0) return NOT_GENERIC;

  let sawNoun = false;
  let cheap = false;
  let best = false;

  for (const raw of tokens) {
    // Arabic glues its "and" to the next word: "أرخص وأحلى وجبة" arrives as
    // ["ارخص","واحلي","وجبه"], and an unstripped "واحلي" reads as a dish.
    const token = stripConjunction(raw);

    if (GENERIC_NOUNS.has(token) || HANDOVER_VERBS.has(token)) {
      sawNoun = true;
      continue;
    }
    if (CHEAP_QUALIFIERS.has(token)) {
      cheap = true;
      continue;
    }
    if (BEST_QUALIFIERS.has(token)) {
      best = true;
      continue;
    }
    if (FILLERS.has(token)) continue;
    // A word we can't account for — the customer named something real.
    return NOT_GENERIC;
  }

  if (!sawNoun) return NOT_GENERIC;
  // Both qualifiers at once ("أرخص وأحلى وجبة") is a contradiction; the
  // budget wins, because overspending on someone's behalf is the worse miss.
  return { isGeneric: true, prefer: cheap ? 'cheapest' : best ? 'best' : 'any' };
}
