// What Rico understands when the model can't answer.
//
// The classifier runs on Groq's free tier, which caps every model at a
// handful of calls a minute and ~29 a day. Past that, /classify used to fail
// and the app fell back to its own small keyword table — one that knew ~70
// shop words, so "بدي قاعة افراح" got "ما فهمتك". This answers on the server
// instead, from a much larger table (keyword-tables.ts), so every installed
// app gets it the moment the server is deployed.
//
// No Nest, no I/O: a plain function over the message, testable on its own
// (keyword-classifier.spec.ts runs the agent corpus through it).

import { distance } from 'fastest-levenshtein';
import { normalizeArabic } from '../../learning/constants/normalize';
import { professionRegistry } from '../../professionals/constants/professions.registry';
import { Intent, validateIntent } from '../intent-validation';
import { isOrderComplaint, OrderDeps, parseBasket, parseOrder } from './order-parser';
import { editBasket } from './basket-edit';
import { CATEGORIES, MAX_INTENTS } from '../constants/categories';
import {
  ABOUT_RICO,
  BRANDS,
  CONTEXT_WORDS,
  DEALS_WORDS,
  FILLER_WORDS,
  FIXED_PLACES,
  FREE_PLACES,
  FUZZY_STOPLIST,
  FreePlace,
  HOW_TO_OPENERS,
  NARRATIVE_WORDS,
  NEED_WORDS,
  NEGATED_WANT,
  OBJECT_VERBS,
  OPINION_WORDS,
  ORDER_VERBS,
  ORDINALS,
  PERSON_CUES,
  PROBLEMS,
  RANK_PATTERNS,
  RENTALS,
  RENTAL_WORDS,
  SHOP_WORDS,
  STRONG_NARRATIVE,
  WANT_WORDS,
} from './keyword-tables';

type Target =
  | { type: 'fixed'; slug: string }
  | { type: 'free'; place: FreePlace }
  | { type: 'pro'; slug: string }
  | { type: 'brand'; category: string; name: string }
  | { type: 'deals' };

interface Pattern {
  re: RegExp;
  /** Length of the keyword itself — the longest keyword wins a span. */
  len: number;
  target: Target;
}

interface Hit {
  start: number;
  end: number;
  len: number;
  target: Target;
  /** Describes another request rather than being one: "شاليه **بالبحر**",
   * "طباخ يطبخ **ذبايح**", "سبا **بنفس المول**". */
  modifier: boolean;
  /** Follows "في"/"فيه"/"عشان"… — a modifier only when a request precedes it. */
  contextual: boolean;
}

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const NON_WORD = /[^\p{L}\p{N}\s]/gu;

/** normalizeArabic, plus the stretched letters people type for emphasis
 * ("جعااااان", "اسنااان") folded back to one. */
function fold(text: string): string {
  return normalizeArabic(text).replace(/(\p{L})\1{2,}/gu, '$1');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The prefix is captured: "بالمول" and "للعرس" are where or what for, not
// what — see isModifier.
const LONG_PREFIX = '(وال|بال|فال|كال|عال|لل|ال|و|ب|ل|ف|ك)?';
const LONG_SUFFIX = '(?:ات|ين|ون|ه|ي|يه|ها|هم|نا|كم)?';
// Short words get almost no affixes: with them, "بق" (bedbugs) matched
// "بقي", and "عود" matched "يعود".
const SHORT_PREFIX = '(وال|بال|عال|لل|ال|و)?';

function wordPattern(keyword: string): { source: string; len: number } | null {
  const folded = fold(keyword);
  if (!folded) return null;
  const body = folded.split(' ').map(escape).join('\\s+(?:ال|لل|ل)?');
  const short = folded.length <= 3;
  return {
    source: `(?<=^|\\s)${short ? SHORT_PREFIX : LONG_PREFIX}${body}${short ? '' : LONG_SUFFIX}(?=\\s|$)`,
    len: folded.length,
  };
}

function compile(words: string[], target: Target): Pattern[] {
  const out: Pattern[] = [];
  for (const w of words) {
    const p = wordPattern(w);
    if (p) out.push({ re: new RegExp(p.source, 'gu'), len: p.len, target });
  }
  return out;
}

function anyOf(words: string[]): RegExp {
  const parts = words.map((w) => wordPattern(w)).filter((p): p is { source: string; len: number } => !!p);
  return new RegExp(parts.map((p) => `(?:${p.source})`).join('|'), 'u');
}

const foldedSet = (words: string[]) => new Set(words.map(fold));

// Places never change at runtime; professions do (the owner edits them from
// the dashboard), so their patterns are rebuilt when the registry's version
// moves.
const PLACE_PATTERNS: Pattern[] = [
  ...FIXED_PLACES.flatMap((p) => compile(p.words, { type: 'fixed', slug: p.slug })),
  ...FREE_PLACES.flatMap((p) => compile(p.words, { type: 'free', place: p })),
  ...BRANDS.flatMap((b) => b.names.flatMap((n) => compile([n], { type: 'brand', category: b.category, name: n }))),
  ...compile(DEALS_WORDS, { type: 'deals' }),
];

/** Single words long enough to survive a one-letter typo without turning
 * into a different word — what the fuzzy pass compares against. */
interface FuzzyWord {
  word: string;
  target: Target;
}
const placeFuzzy: FuzzyWord[] = [
  ...FIXED_PLACES.flatMap((p) =>
    p.words.map((w) => ({
      word: fold(w),
      target: { type: 'fixed', slug: p.slug } as Target,
    })),
  ),
  ...FREE_PLACES.flatMap((p) =>
    p.words.map((w) => ({
      word: fold(w),
      target: { type: 'free', place: p } as Target,
    })),
  ),
].filter((f) => f.word.length >= 5 && !f.word.includes(' '));

let professionCache: {
  version: number;
  patterns: Pattern[];
  fuzzy: FuzzyWord[];
} = { version: -1, patterns: [], fuzzy: [] };

function professionTables() {
  if (professionCache.version === professionRegistry.version) return professionCache;
  const patterns: Pattern[] = [];
  const fuzzy: FuzzyWord[] = [];
  const add = (words: string[], slug: string) => {
    const target: Target = { type: 'pro', slug };
    patterns.push(...compile(words, target));
    for (const w of words) {
      const f = fold(w);
      if (f.length >= 5 && !f.includes(' ')) fuzzy.push({ word: f, target });
    }
  };
  for (const entry of professionRegistry.active()) add([entry.label, ...entry.aliases], entry.slug);
  for (const problem of PROBLEMS) {
    if (professionRegistry.has(problem.profession)) add(problem.words, problem.profession);
  }
  professionCache = { version: professionRegistry.version, patterns, fuzzy };
  return professionCache;
}

const SHOP_LEAD = new RegExp(`^(?:${SHOP_WORDS.map((w) => escape(fold(w))).join('|')})\\s`, 'u');
const SHOP_BEFORE = new RegExp(`(?:^|\\s)(?:${SHOP_WORDS.map((w) => escape(fold(w))).join('|')})\\s*$`, 'u');
const PERSON_CUE_RE = anyOf(PERSON_CUES);
const HOW_TO_RE = new RegExp(`^(?:${HOW_TO_OPENERS.map((w) => escape(fold(w))).join('|')})(?:\\s|$)`, 'u');
const OPINION_RE = anyOf(OPINION_WORDS);
const NEED_RE = anyOf(NEED_WORDS);
const ABOUT_RICO_RE = anyOf(ABOUT_RICO);
const NARRATIVE_RE = anyOf(NARRATIVE_WORDS);
const STRONG_NARRATIVE_RE = anyOf(STRONG_NARRATIVE);
const RENTAL_RE = anyOf(RENTAL_WORDS);
// Rental targets, one pattern per vehicle noun. They only fire when a rental
// word is in the message, and then outrank anything else on that span: "استأجر
// سكوتر كهربائي" is a scooter rental, not an electrician.
const RENTAL_PATTERNS: Pattern[] = RENTALS.flatMap((r) =>
  compile(
    r.nouns,
    r.slug
      ? { type: 'fixed', slug: r.slug }
      : { type: 'free', place: { key: 'shop', value: r.value!, label: r.label, words: [] } },
  ).map((p) => ({ ...p, len: p.len + 1000 })),
);
// A described problem is evidence of a request; a trade's name is not ("انا
// ممرض" is a job, "اخوي سواق" a brother). The PROBLEMS table holds both, so
// the names — the registry's own words, and the person nouns listed here —
// are left out.
const PERSON_NOUNS = foldedSet([
  'مصور', 'مصوره', 'طباخ', 'طباخه', 'طبيخ', 'شيف', 'سواق', 'سائق', 'مترجم', 'ممرض', 'ممرضه', 'ممرض منزلي', 'تمريض', 'جليسه', 'مربيه',
  'مدرب شخصي', 'مدرب رياضي', 'كوتش', 'ستلايتجي', 'بويلرجي', 'دهين', 'حنايه', 'محفظ', 'محفظه', 'مرافق', 'مرافقه', 'مصمم', 'مصممه',
  'منظم حفلات', 'منظمه حفلات', 'منظم مناسبات', 'خبيره تجميل', 'مدرس خصوصي', 'معلم خصوصي', 'مدرب سباحه', 'مدربه سباحه', 'سباكه',
  'شركه تنظيف', 'شركات تنظيف', 'عامله نظافه', 'شركه نقل', 'شركه نقل عفش', 'شركه نقل اثاث', 'chef', 'driver', 'nurse',
  'translator', 'photographer', 'tutor', 'plumber', 'electrician', 'cleaner', 'handyman', 'painter', 'babysitter', 'movers',
  // Service nouns: "مشوار" names a ride, it doesn't describe a problem.
  'مشوار', 'مشاوير', 'توصيله', 'مندوب', 'سائقه', 'سواقه', 'سايق', 'سواقين',
]);
// Nouns that name a kind of place — what can follow "احسن" in a request
// ("احسن مطعم") as opposed to an opinion question ("احسن دوا").
const PLACE_NOUN_RE = new RegExp(
  `^(?:${['مطعم', 'كافيه', 'مقهى', 'صيدليه', 'مستشفى', 'فندق', 'صالون', 'نادي', 'مول', 'سوبرماركت', 'بقاله', 'عياده', 'كراج', 'ورشه', 'مخبز', 'حلاق', 'مغسله', 'شركه', 'مكتب', 'محل', 'مركز'].join('|')})(?:\\s|$)`,
  'u',
);
const REMARK_RE = anyOf(['صار', 'صارت', 'كان', 'كانت', 'رجعت فتحت', 'سكرت', 'سكر', 'وصلت ولا', 'ولا لسا', 'لسا']);
const PROBLEM_RE = anyOf(
  PROBLEMS.flatMap((p) => p.words).filter((w) => {
    const f = fold(w);
    return !PERSON_NOUNS.has(f) && !professionRegistry.all().some((e) => fold(e.label) === f || e.aliases.some((a) => fold(a) === f));
  }),
);
// The Levantine "is there": "في سينما فيها عرض الليلة؟" asks for one.
const IS_THERE_RE = /^(?:في|فيه|فى|اكو|كاين)\s/u;
const NEGATED_RE = new RegExp(anyOf(NEGATED_WANT).source, 'gu');
const ANY_RANK_RE = anyOf(RANK_PATTERNS.flatMap((r) => r.words).concat(['اقرب', 'nearest']));
const WANT_RE = anyOf(WANT_WORDS);
const ORDER_VERB_RE = anyOf(ORDER_VERBS);
const RANK_RES = RANK_PATTERNS.map((r) => ({
  rank: r.rank,
  re: anyOf(r.words),
}));
const CONTEXT = foldedSet(CONTEXT_WORDS);
const OBJECT_VERB = foldedSet(OBJECT_VERBS);
const FUZZY_STOP = foldedSet([...FUZZY_STOPLIST, ...RANK_PATTERNS.flatMap((r) => r.words), 'تقييم', 'التقييم', 'تقييمه', 'الاعلى', 'المفتوح', 'بعيدين', 'بعاد', 'شغاله', 'الشغال']);
const INDIRECT = foldedSet(['لي', 'لنا', 'لك', 'له', 'لها']);

function rankIn(text: string): string {
  for (const { rank, re } of RANK_RES) if (re.test(text)) return rank;
  return 'nearest';
}

/** The word right before [index], or ''. Skips "لي/لنا": in "يطبخ لنا
 * ذبيحه" the word that matters is the verb. */
function wordBefore(text: string, index: number): string {
  const words = text.slice(0, index).trim().split(' ');
  let last = words.pop() ?? '';
  if (INDIRECT.has(last) && words.length) last = words.pop()!;
  return last;
}

/** A verb whose object this is ("يطبخ ذبايح", "تجي البيت"): third-person
 * present verbs, plus the few that read as nouns and are listed by hand. */
function isObjectVerb(word: string): boolean {
  if (OBJECT_VERB.has(word)) return true;
  return /^ي\p{L}{2,}/u.test(word) && !/^(?:يمني|يوم|يومي|يوغا|يوجا)$/u.test(word);
}

function findHits(text: string): Hit[] {
  const hits: Hit[] = [];
  const { patterns } = professionTables();
  const rentals = RENTAL_RE.test(text) ? RENTAL_PATTERNS : [];
  for (const p of [...PLACE_PATTERNS, ...patterns, ...rentals]) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text))) {
      // "محل دهانات" is a shop that sells paint, not a painter.
      if (p.target.type === 'pro' && SHOP_BEFORE.test(text.slice(0, m.index))) continue;
      const prefix = m[1] ?? '';
      const prev = wordBefore(text, m.index);
      // A verb's object is a description only when it's a place: "يطبخ
      // ذبايح" isn't a butcher search, but "يركب الستاير" is the trade.
      const modifier =
        // On a trade, "ب" is a verb's present tense ("بنقل عفش" — "moves
        // furniture"), not "in"; only places take it as a description.
        (p.target.type !== 'pro' && (prefix === 'ب' || prefix === 'ل' || prefix === 'لل' || prefix === 'بال')) ||
        // "عالمطار": where to, not what.
        prefix === 'عال' ||
        (p.target.type !== 'pro' && isObjectVerb(prev));
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        len: p.len,
        target: p.target,
        modifier,
        contextual: p.target.type !== 'deals' && CONTEXT.has(prev),
      });
      if (m[0].length === 0) p.re.lastIndex++;
    }
  }
  return hits;
}

/** Nothing matched exactly: one letter off is a typo ("تكيبف", "الجوزات"),
 * as long as the word is long enough that one letter can't make it a
 * different word. */
function fuzzyHits(text: string): Hit[] {
  const candidates = [...placeFuzzy, ...professionTables().fuzzy];
  const hits: Hit[] = [];
  let offset = 0;
  for (const token of text.split(' ')) {
    const start = offset;
    offset += token.length + 1;
    const bare = token.replace(/^(?:وال|بال|عال|لل|ال|و|ب)/u, '');
    if (bare.length < 5 || FUZZY_STOP.has(token) || FUZZY_STOP.has(bare)) continue;
    // Same first letter: a typo slips inside a word far more often than at
    // its start, and without this "عافيه" became "كافيه".
    const best = candidates.find(
      (c) => c.word[0] === bare[0] && Math.abs(c.word.length - bare.length) <= 1 && distance(c.word, bare) === 1,
    );
    if (best)
      hits.push({
        start,
        end: start + token.length,
        len: best.word.length,
        target: best.target,
        modifier: false,
        contextual: false,
      });
  }
  return hits;
}

function key(t: Target): string {
  switch (t.type) {
    case 'fixed':
      return `place:${t.slug}`;
    case 'free':
      return `place:other:${t.place.value}`;
    case 'pro':
      return `pro:${t.slug}`;
    case 'brand':
      return `place:${t.category}`;
    case 'deals':
      return 'deals';
  }
}

/** Longest keyword first; a tie between a place and a trade goes to the
 * trade only when the message asks for a person ("حدا يجي", "فني"). */
function pick(hits: Hit[], wantsPerson: boolean): Hit[] {
  const placeFirst = (h: Hit) => (h.target.type === 'pro' ? (wantsPerson ? 0 : 1) : wantsPerson ? 1 : 0);
  // A brand outranks the category word next to it: "صيدلية النهدي" is a
  // search for النهدي, not for any pharmacy plus النهدي.
  const brandFirst = (h: Hit) => (h.target.type === 'brand' ? 0 : 1);
  const sorted = [...hits].sort(
    (a, b) => b.len - a.len || placeFirst(a) - placeFirst(b) || brandFirst(a) - brandFirst(b) || a.start - b.start,
  );
  const chosen: Hit[] = [];
  for (const h of sorted) {
    if (chosen.some((c) => h.start < c.end && c.start < h.end)) continue;
    chosen.push(h);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

/** Drops what only describes another request — unless nothing else is
 * left, in which case the description is all there is. A context word
 * ("فيه", "في") counts only after some other request: at the start it is
 * the Levantine "is there" ("وين في صيدلية"). */
function dropModifiers(chosen: Hit[]): Hit[] {
  const real = chosen.filter((h, i) => !(h.modifier || (h.contextual && i > 0)));
  return real.length ? real : chosen;
}

const DESTINATIONS = new Set(['place:school', 'place:university', 'place:kindergarten', 'place:clinic', 'place:hospital', 'place:mall', 'place:other:airport']);
const STATIONS = new Set(['place:other:bus_station', 'place:other:train_station', 'place:other:ferry_terminal']);

/** Two readings a trip needs. Where a driver is taking someone ("يوصل
 * الولاد المدرسه", "يوديني المطار") is the trip, not a second search. And a
 * ticket bought at a station ("مكتب جت بقطع تذكرة") is that station, not a
 * travel agency. */
function markTrips(chosen: Hit[]): Hit[] {
  const driverAt = chosen.findIndex((h) => h.target.type === 'pro' && h.target.slug === 'driver');
  const hasStation = chosen.some((h) => STATIONS.has(key(h.target)));
  return chosen.map((h, i) => {
    if (driverAt >= 0 && i > driverAt && DESTINATIONS.has(key(h.target))) return { ...h, modifier: true };
    if (hasStation && h.target.type === 'fixed' && h.target.slug === 'travel_agency') return { ...h, modifier: true };
    return h;
  });
}

/** "احسن مكتب سياحي", "افضل محل" — a ranking word followed by a place. */
function rankedPlace(text: string, chosen: Hit[]): boolean {
  const m = /(?:^|\s)(?:احسن|افضل|ارخص|اقرب)\s+/u.exec(text);
  if (!m) return false;
  const at = m.index + m[0].length;
  return SHOP_LEAD.test(text.slice(at)) || PLACE_NOUN_RE.test(text.slice(at));
}

/** "مواقف المطار", "باصات الجامعة", "كراج العبدلي": a place followed
 * straight away by a definite one is that first place, described by the
 * second — Arabic's construct state, not two requests. */
function markConstructs(text: string, chosen: Hit[]): Hit[] {
  return chosen.map((h, i) => {
    const prev = chosen[i - 1];
    if (!prev || prev.target.type === 'deals' || h.target.type === 'pro' || h.target.type === 'deals') return h;
    const adjacent = text.slice(prev.end, h.start).trim() === '';
    return adjacent && text.startsWith('ال', h.start) ? { ...h, modifier: true } : h;
  });
}

/** "عروض على المكيفات" and "عروض مطاعم" are one request for deals. A
 * request joined to the deals by "و" or "بعدين" is its own. */
function foldIntoDeals(text: string, chosen: Hit[]): Hit[] {
  const deals = chosen.filter((h) => h.target.type === 'deals');
  if (!deals.length) return chosen;
  return chosen.filter((h) => {
    if (h.target.type === 'deals') return true;
    return !deals.some((d) => {
      const gap = h.start > d.end ? text.slice(d.end, h.start) : text.slice(h.end, d.start);
      const tokens = gap.trim() ? gap.trim().split(' ') : [];
      const joinedByAnd =
        /^و/u.test(text.slice(Math.max(h.start, d.start)).trim()) || tokens.some((t) => /^و/u.test(t) || t === 'بعدين' || t === 'كمان');
      return tokens.length <= 3 && !joinedByAnd;
    });
  });
}

function toIntent(t: Target, rank: string): Intent | null {
  const base = {
    rank,
    brandHint: null,
    customTag: null,
    label: null,
    referencedPosition: null,
    profession: null,
  };
  switch (t.type) {
    case 'fixed':
      return validateIntent({ ...base, kind: 'place', category: t.slug });
    case 'free':
      return validateIntent({
        ...base,
        kind: 'place',
        category: 'other',
        customTag: { key: t.place.key, value: t.place.value },
        label: t.place.label,
      });
    case 'brand':
      return validateIntent({
        ...base,
        kind: 'place',
        category: t.category,
        brandHint: t.name,
      });
    case 'pro':
      return validateIntent({ kind: 'professional', profession: t.slug });
    case 'deals':
      return validateIntent({ kind: 'deals' });
  }
}

// ─── Orders ────────────────────────────────────────────────────────────────

const FIXED_SLUGS = new Set<string>(CATEGORIES);

/** What the order parser needs to know about words, from the tables here. */
const ORDER_DEPS: OrderDeps = {
  categoryOf: (words) => firstFixedCategory(words),
  isProduct: (word) => findHits(word).some((h) => h.target.type === 'fixed' || h.target.type === 'free'),
};

function firstFixedCategory(text: string): string | null {
  for (const h of pick(findHits(fold(text)), false)) {
    if (h.target.type === 'fixed' && FIXED_SLUGS.has(h.target.slug)) return h.target.slug;
    if (h.target.type === 'brand') return h.target.category;
  }
  return null;
}

// ─── Entry point ───────────────────────────────────────────────────────────

/** "ما ابي مطعم، ابي كافيه" — what sits between a negated want and the
 * next want is what the customer turned down. */
function dropNegated(text: string, chosen: Hit[]): Hit[] {
  const spans: [number, number][] = [];
  NEGATED_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NEGATED_RE.exec(text))) {
    const end = m.index + m[0].length;
    const rest = text.slice(end);
    const nextWant = WANT_RE.exec(rest);
    spans.push([m.index, nextWant ? end + nextWant.index : text.length]);
  }
  // "كافيه مو مطعم", "مش صراف آلي": the word right after "مو"/"مش" is turned down.
  return chosen.filter((h) => !spans.some(([a, b]) => h.start >= a && h.start < b) && !NOT_WORDS.has(wordBefore(text, h.start)));
}
const NOT_WORDS = foldedSet(['مو', 'مش', 'مب', 'مهو', 'ماهو', 'not', 'بدل']);

/**
 * Is this a request at all? A keyword alone isn't enough: "اخوي سباك",
 * "امبارح اكلت بمطعم", "الكافيهات صارت غالية" all name a place and ask for
 * nothing. A message counts as a request when it says it wants something
 * (بدي، وين، محتاج), ranks (اقرب، ارخص), describes a problem (خربان،
 * يوجعني), or reads like a search box — a few words, or one that leads with
 * the kind of place ("محل عصير طازج") — and isn't a story or a thank-you.
 */
function asksForSomething(text: string, chosen: Hit[]): boolean {
  // "كنت محتاج سباك بس انحلت" — the need is over, whatever else it says.
  if (STRONG_NARRATIVE_RE.test(text)) return false;
  if (WANT_RE.test(text) || IS_THERE_RE.test(text) || ORDER_VERB_RE.test(text)) return true;
  // Asking for deals is a request however it's phrased ("صاحبي بيقول في
  // عروض، شو هي؟").
  if (chosen.some((h) => h.target.type === 'deals')) return true;
  // A problem is a request for whoever fixes it, even inside a story:
  // "ضرسي يوجعني من امس", "لقيت صراصير بالمطبخ".
  if (NEED_RE.test(text) || PROBLEM_RE.test(text)) return true;
  // A search typed like one starts with the place ("محل عطور عود اصلي",
  // "فندق نظيف ومش غالي"), without "the" — stories start with "المطعم اللي…".
  // A sentence that says what something became ("صالون بيتنا صار حلو") is
  // a remark, even when it opens with a place.
  if (!text.startsWith('ال') && (chosen[0].start === 0 || SHOP_LEAD.test(text)) && !REMARK_RE.test(text)) return true;
  // What's left is a story, a remark or a thank-you unless it says otherwise:
  // "اخوي سباك", "صباح الخير يا احلى كافيه", "الكافيهات صارت غالية".
  if (NARRATIVE_RE.test(text)) return false;
  if (ANY_RANK_RE.test(text) || RENTAL_RE.test(text) || chosen.some((h) => h.target.type === 'pro')) return true;
  const words = text.split(' ').filter((w) => !['يا', 'ريكو', 'تدلل', 'لو', 'سمحت', 'بليز', 'الله', 'يخليك'].includes(w));
  return words.length <= 4;
}

/**
 * يفهم الرسالة بالكلمات، أو يرجّع [] إذا ما فهمها.
 *
 * [] معناها «ما أعرف» — والمستدعي يكمل كأن هالمسار مش موجود (يرمي الخطأ
 * الأصلي، والتطبيق يرد بردوده المحلية: تحية، شكر، توضيح). ما نخمّن أبداً:
 * جواب غلط أسوأ من «وضّح لي».
 */
export function keywordClassify(message: string): Intent[] {
  const text = fold(message ?? '');
  if (!text || text.length > 400) return [];

  // "كيف اجدد الجواز" and "شو احسن دوا للصداع" ask how or which, not
  // where — there is nothing to search for.
  if (ABOUT_RICO_RE.test(text)) return [];
  const wants = WANT_RE.test(text);
  if (!wants && HOW_TO_RE.test(text)) return [];

  const parsed = parseOrder(message, ORDER_DEPS);
  if (parsed) {
    // "اطلب لي بنادول من الصيدليه وفيه عروض", "…وكمان وين اقرب صراف": what
    // follows the basket is read as requests of its own.
    const rest = parsed.rest ? keywordClassify(parsed.rest.replace(/^و/u, '')).filter((i) => i.kind !== 'order') : [];
    return [parsed.order, ...rest].slice(0, MAX_INTENTS);
  }
  if (isOrderComplaint(message)) return [];

  let chosen = pick(findHits(text), PERSON_CUE_RE.test(text));
  if (!chosen.length) chosen = pick(fuzzyHits(text), false);
  chosen = dropNegated(text, chosen);
  // "شو احسن دوا للصداع" asks an opinion; "شو احسن مكتب سياحي" asks for
  // the best one nearby. The difference is a place right after the ranking.
  if (!wants && OPINION_RE.test(text) && !rankedPlace(text, chosen)) return [];
  if (!chosen.length || !asksForSomething(text, chosen)) return [];
  chosen = foldIntoDeals(text, dropModifiers(markTrips(markConstructs(text, chosen))));

  const intents: Intent[] = [];
  const seen = new Set<string>();
  chosen.forEach((hit, i) => {
    const k = key(hit.target);
    if (seen.has(k)) return;
    seen.add(k);
    // Rank words belong to the request they sit next to: the stretch of
    // text between the neighbouring requests.
    const from = i > 0 ? chosen[i - 1].end : 0;
    const to = i < chosen.length - 1 ? chosen[i + 1].start : text.length;
    const intent = toIntent(hit.target, rankIn(text.slice(from, to)));
    if (intent) intents.push(intent);
  });

  return intents.slice(0, MAX_INTENTS);
}

// ─── Conversations ─────────────────────────────────────────────────────────

export interface ConversationContext {
  history: { role: string; content: string }[];
  lastResults: { label: string; items: { position: number; name: string }[] } | null;
}

/** Words that only refine the search before ("في ارخص؟", "ابعد شوي",
 * "غيره"), with no place of their own. */
const REFINE_RE = anyOf([
  'ارخص', 'الارخص', 'رخيص', 'احسن', 'افضل', 'اعلى تقييم', 'الاعلى', 'مفتوح', 'فاتح', 'فاتحه', 'مفتوحه', 'ابعد', 'اقرب', 'غيره',
  'غيرها', 'غيرهم', 'كمان واحد', 'واحد ثاني', 'وحده ثانيه', 'نفس الشي', '24 ساعه', 'نظيف', 'اكبر', 'اوسع', 'cheaper',
  'better', 'open', 'another', 'aw al 2rkhas', '2rkhas', 'arkhas', 'تقييم', 'تقييمه', 'تقييمة', 'شغال', 'شغاله', 'فاضي', 'غالي',
  'غاليين', 'اسعارهم', 'نار', 'بعيدين', 'بعاد', 'بعيد', 'المفتوح', 'الاحسن', 'قريب', 'واحد قريب', 'وحده قريبه', 'اوفر',
  'على قد الجيب', 'يمدحونه', 'بتحكي عنه', 'تقييمهم', 'سعره معقول', 'اسعاره', 'best rated', 'ar5as', 'fi ar5as', 'بالحاره',
  'شي ثاني', 'اشي تاني', 'شي تاني', 'غالين', 'مب حلوين', 'مش حلوين', 'اقل',
]);
/** "التاني", "الأخير", "eltani": an item on the list just shown. */
const POINTERS: Map<string, number> = new Map(
  Object.entries({ الاول: 1, اول: 1, الاولى: 1, الثاني: 2, التاني: 2, الثانيه: 2, التانيه: 2, الثالث: 3, التالت: 3, الثالثه: 3, التالته: 3, الرابع: 4, الرابعه: 4, الخامس: 5, الخامسه: 5, eltani: 2, 'el tani': 2, elawal: 1, 'el awal': 1, eltalet: 3, '2wla': 1, awla: 1, '2wal': 1 }).map(([k, v]) => [fold(k), v]),
);
const LAST_RE = anyOf(['الاخير', 'الاخيره', 'اخر واحد', 'اخر وحده', 'last', 'akher', 'al akher', 'el akher']);
/** "ايه", "اه": a yes before the answer. */
const YES_RE = /^(?:ايه|اه|اي|ايوه|اكيد|yes|yeah|اوكي|تمام)\s+/u;
/** "خلها ثلاث", "لا خليهم تنين", "لا لا ٣ بس": a corrected quantity. */
const RECOUNT_RE = /(?:^|\s)(?:خلها|خليها|خليهم|خلهم|خليه|خله|عدلها|خلي)(?:\s|$)|^لا\s+(?:لا\s+)?\d/u;
const FROM_IT_RE = anyOf(['منه', 'منها', 'منهم', 'من عنده', 'من عندهم']);
/** Additions to an order already started. */
const ADD_RE = /^(?:و|وبعد|زيد|وزيد|زود|وزود|ضيف|وضيف|كمان|وكمان|بعد|and)(?:\s|$)/u;
/** Questions and remarks about the list itself — its phones, prices, hours,
 * parking — or plans made from it. Rico has nothing to search for. */
const ABOUT_LIST_RE = anyOf([
  'هل', 'كم سعر', 'بكم', 'سعر', 'رقم', 'تلفون', 'تليفون', 'يفتح', 'بيفتح', 'بفتح', 'بقبل', 'يقبل', 'فيزا', 'مدى', 'قسم', 'عندهم',
  'جربته', 'جربتها', 'اكله', 'صاحبه', 'بروح', 'رح اروح', 'بحكي', 'رح احكي', 'بتصرف', 'ههه', 'هههه', 'مش دايما', 'مو دايما',
  'رح اكل بالبيت', 'بلاش', 'خلص بلاش', 'قرايبي', 'سهرانين', 'مواقف', 'يسوي', 'بيعمل', 'بيسوي',
]);
/** Where a message turns to something else: what comes after is the request. */
const CUT_RE = /(?:^|\s)(?:لا استنى|استنى|لا لا|لا|خلص|بعدين|الحين|هلا|هلأ|هلق|هالمره|هسا)(?:\s|$)/u;
/** "التاني شي", "اول اشي": an ordinal counting the customer's own requests. */
const THING_RE = /(?:^|\s)(?:الاول|اول|التاني|الثاني|ثاني|تاني|التالت|الثالث)\s+(?:شي|اشي|شغله|حاجه|حاجة)(?:\s|$)/u;
/** A comparison that asks for a different item than the one pointed at
 * ("زي الأول بس ارخص"); a status ("الرابع فاتح؟") stays on the item. */
const COMPARE_RE = anyOf(['ارخص', 'الارخص', 'احسن', 'افضل', 'اعلى تقييم', 'الاعلى', 'اقرب', 'اوفر', 'غيره', 'غيرها', 'واحد ثاني', 'بدل']);
/** "مين فيهم…", "اي واحد…": which one of the list — a refinement by what follows. */
const WHICH_RE = anyOf(['مين فيهم', 'مين منهم', 'اي واحد', 'اي وحده', 'انهي واحد', 'مين اللي', 'ايهم', 'مين فيهن']);
/** A shop's kind → the trade that comes to the customer instead
 * ("بلاش اروح، بدي فني يجي يشوفها"). */
const PLACE_TO_PRO: Record<string, string> = {
  'place:appliance_repair': 'appliance_repair', 'place:car_wash': 'mobile_car_wash', 'place:car_repair': 'car_mechanic',
  'place:phone_repair': 'phone_repair', 'place:hairdresser': 'home_barber', 'place:beauty': 'home_beautician',
  'place:maintenance_centre': 'handyman', 'place:tailor': 'tailor', 'place:other:tire_shop': 'tire_service',
};
const COMES_RE = anyOf(['يجي', 'يجيني', 'يجيلي', 'يجي البيت', 'عند البيت', 'بالبيت', 'للبيت', 'ما اقدر اطلع', 'ما بقدر اطلع', 'بلاش اروح']);
const CAR_SEARCH = new Set(['place:car_repair', 'place:maintenance_centre', 'place:oil_change', 'place:auto_parts', 'place:car_wash', 'place:other:tire_shop']);
/** Wants that leave no doubt — not "رح" ("رح اكل بالبيت" is a plan, not a request). */
const CLEAR_WANT_RE = anyOf(['ابي', 'أبي', 'ابغى', 'ابغا', 'ابغي', 'بدي', 'بدنا', 'محتاج', 'محتاجه', 'احتاج', 'اريد', 'عايز', 'عاوز', 'نبي', 'نبغى', 'دلني', 'وين']);
const JOINER_RE = /(?:^|\s)(?:وكمان|و كمان|وبعدين|وبعد|و)(?:\s|$)/u;
const CLOSERS_RE = anyOf(['شكرا', 'يسلمو', 'مشكور', 'تمام', 'خلص', 'لا خلص', 'اوكي', 'ok', 'thanks', 'يعطيك العافيه', 'الله يعطيك العافيه']);

function pointerIn(text: string, listLength: number): number | null {
  if (LAST_RE.test(text)) return listLength || null;
  for (const w of text.split(' ')) {
    const n = POINTERS.get(w) ?? POINTERS.get(w.replace(/^(?:و|ب)/u, ''));
    if (n && n <= Math.max(listLength, 5)) return n;
  }
  const two = text.match(/(?:^|\s)(el (?:tani|awal|talet))(?:\s|$)/u);
  return two ? POINTERS.get(two[1]) ?? null : null;
}

/** The search the conversation was in: the list Rico last showed, or failing
 * that the customer's own last request. */
function previousSearch(ctx: ConversationContext): Intent | null {
  const label = ctx.lastResults?.label;
  if (label) {
    const fromLabel = keywordClassify(label).find((i) => i.kind === 'place' || i.kind === 'professional');
    if (fromLabel) return fromLabel;
  }
  const users = ctx.history.filter((h) => h.role === 'user').map((h) => h.content).reverse();
  for (const u of users.slice(0, 4)) {
    const found = keywordClassify(u).find((i) => i.kind === 'place' || i.kind === 'professional');
    if (found) return found;
  }
  return null;
}

/** An order read against the list Rico just showed: "من الأخير" is its last
 * item, "من النهدي" is "صيدلية النهدي" on it, and a position gets the shop's
 * name from it. */
function onTheList(order: Intent, ctx: ConversationContext): Intent {
  const items = ctx.lastResults?.items ?? [];
  if (!items.length) return order;
  let position = order.referencedPosition;
  if (!position && order.placeName && LAST_RE.test(fold(order.placeName))) position = items.length;
  if (!position && order.placeName) {
    const want = fold(order.placeName).replace(/^ال/u, '');
    const hit = items.find((it) => fold(it.name).split(' ').some((w) => w.replace(/^ال/u, '') === want) || fold(it.name).includes(want));
    if (hit) position = hit.position;
  }
  if (!position) return order;
  const name = items.find((it) => it.position === position)?.name ?? order.placeName;
  return validateIntent({ ...order, referencedPosition: position, placeName: name, category: null }) ?? order;
}

/** The order the conversation was building, if the customer's last request was one. */
function previousOrder(ctx: ConversationContext): Intent | null {
  const users = ctx.history.filter((h) => h.role === 'user').map((h) => h.content).reverse();
  for (const u of users.slice(0, 3)) {
    const found = keywordClassify(u).find((i) => i.kind === 'order');
    if (found) return found;
  }
  return null;
}

/** The list item the customer picked a turn ago ("الأولى"), for "ابي منها…". */
function focusedPosition(ctx: ConversationContext): number | null {
  const listLength = ctx.lastResults?.items.length ?? 0;
  if (listLength === 1) return 1;
  const users = ctx.history.filter((h) => h.role === 'user').map((h) => fold(h.content)).reverse();
  for (const u of users.slice(0, 2)) {
    const p = pointerIn(u, listLength);
    if (p) return p;
  }
  return null;
}

/**
 * keywordClassify, reading the message in the conversation it belongs to.
 *
 * A follow-up rarely names what it's about: "في ارخص؟", "التاني", "ابي منها
 * كيلو", "وزيد ٢ فلافل". Those borrow the search, the list or the order from
 * the turns before. A message that names something of its own ("طيب بدي
 * صيدلية كمان") is read on its own, as before.
 */
export function keywordClassifyInContext(message: string, ctx: ConversationContext): Intent[] {
  const direct = keywordClassify(message).map((i) => (i.kind === 'order' ? onTheList(i, ctx) : i));
  if (!ctx.history.length && !ctx.lastResults) return direct;
  const text = fold(message);
  const listLength = ctx.lastResults?.items.length ?? 0;
  const wantsNow = CLEAR_WANT_RE.test(text) || ORDER_VERB_RE.test(text);
  // "ليش تأخر الطلب", "اجاني الطلب ناقص": about an order already sent.
  if (isOrderComplaint(message, false) && !ORDER_VERB_RE.test(text)) return [];

  // "في ارخص... لا استنى، بدي مخبز", "الأرخص بعدين، الحين ابغى ورشة": the
  // customer changed their mind mid-message; only the end counts.
  const cut = [...text.matchAll(new RegExp(CUT_RE.source, 'gu'))].pop();
  if (cut && cut.index! > 0) {
    const tail = text.slice(cut.index! + cut[0].length);
    const tailIntents = CLEAR_WANT_RE.test(tail) ? keywordClassify(tail) : [];
    if (tailIntents.some((i) => i.kind !== 'order') && !THING_RE.test(text.slice(0, cut.index))) return tailIntents;
  }
  // "التاني شي: بدي صيدلية" counts requests, not list items.
  if (THING_RE.test(text)) return keywordClassify(text.replace(new RegExp(THING_RE.source, 'u'), ' '));

  // "هل التاني بقبل فيزا؟", "كم سعر الليلة بالأول؟", "التاني جربته قبل":
  // about the list, not a new search.
  if (!wantsNow && !WHICH_RE.test(text) && (listLength || ctx.history.length) && ABOUT_LIST_RE.test(text) && (pointerIn(text, listLength) || !direct.some((i) => i.kind === 'order'))) {
    const fresh = direct.filter((i) => {
      const search = previousSearch(ctx);
      return !search || key2(i) !== key2(search);
    });
    if (!fresh.length || pointerIn(text, listLength)) return [];
  }

  // Ordering from the list: "من التالت اطلبلي…" is read by the order parser
  // already; "ابي منها ٢ كيلو" needs the item picked a turn ago.
  if (FROM_IT_RE.test(text) && !direct.some((i) => i.kind === 'order' && (i.placeName || i.referencedPosition)) && !REFINE_RE.test(text) && (wantsNow || /\d/u.test(text))) {
    const pos = focusedPosition(ctx) ?? pointerIn(text, listLength);
    const items = parseBasket(message.replace(/(?:^|\s)(?:ابي|أبي|ابغى|بدي|اطلب|اطلبلي|لي|منه|منها|منهم)(?=\s|$)/gu, ' '), ORDER_DEPS);
    if (pos && items.length) {
      const order = validateIntent({ kind: 'order', referencedPosition: pos, placeName: ctx.lastResults?.items[pos - 1]?.name ?? null, orderItems: items });
      if (order) return [order];
    }
  }

  const hasPlace = direct.some((i) => i.kind === 'place' || i.kind === 'professional' || i.kind === 'deals');
  const lastUser = [...ctx.history].reverse().find((h) => h.role === 'user')?.content ?? '';
  const answer = text.replace(YES_RE, '');

  // Naming the shop when Rico asked "من وين؟" ("ابي اطلب عشا" + "من البيك"),
  // or the items when it asked what ("بدي اطلب من صيدلية" + "بنادول علبتين").
  if (ORDER_VERB_RE.test(fold(lastUser)) && !previousOrder(ctx) && !direct.some((i) => i.kind === 'order' && (i.placeName || i.referencedPosition))) {
    const joined = keywordClassify(`${lastUser} ${message}`).filter((i) => i.kind === 'order');
    if (joined.length) return joined;
  }

  // Continuing an order already started: "وبعد ٢ كيلو رز", "وزيد ٢ فلافل",
  // "ايه وفيتامين سي", or a corrected count ("لا خليهم تنين"). Dish words
  // in it ("فلافل") would read as a restaurant search on their own; here
  // they go in the basket.
  const prevOrder = previousOrder(ctx);
  if (prevOrder && !CLOSERS_RE.test(answer) && !/(?:^|\s)(?:وين|دلني|عروض|العروض)(?:\s|$)/u.test(answer)) {
    // "شيل البيبسي", "بدل الشاورما خليها فلافل", "لا خلها من هرفي": the
    // whole basket, edited — the app replaces the basket, it doesn't merge.
    const edited = editBasket(prevOrder, message, ORDER_DEPS);
    if (edited) return [edited];
  }
  if (prevOrder && !direct.some((i) => i.kind === 'order') && !CLOSERS_RE.test(answer) && !/(?:^|\s)(?:وين|دلني|عروض|العروض)(?:\s|$)/u.test(answer)) {
    const recount = RECOUNT_RE.test(answer) ? /(\d+)|(?:^|\s)(ثلاث|ثلاثه|تلات|تلاته|تنين|اثنين|ثنتين|اربع|خمس|وحده|واحد)(?:\s|$)/u.exec(answer.replace(/(?:مو|مش)\s+\S+/u, '')) : null;
    if (recount && prevOrder.orderItems?.length) {
      const words: Record<string, number> = { ثلاث: 3, ثلاثه: 3, تلات: 3, تلاته: 3, تنين: 2, اثنين: 2, ثنتين: 2, اربع: 4, خمس: 5, وحده: 1, واحد: 1 };
      const n = recount[1] ? Number(recount[1]) : words[recount[2]];
      const items = prevOrder.orderItems.map((it, k, all) => (k === all.length - 1 ? { ...it, quantity: n } : it));
      const order = validateIntent({ ...prevOrder, orderItems: items });
      if (order) return [order];
    }
    const adding = ADD_RE.test(answer) || /\d|(?:^|\s)(?:نص|ربع|كيلو|علبه|كرتون)/u.test(answer) || YES_RE.test(text) || !WANT_RE.test(answer);
    const items = adding ? parseBasket(answer.replace(ADD_RE, ' '), ORDER_DEPS) : [];
    if (items.length && !WANT_RE.test(answer.replace(/^و/u, ''))) {
      const order = validateIntent({ ...prevOrder, orderItems: [...(prevOrder.orderItems ?? []), ...items] });
      if (order) return [order];
    }
  }

  // An item picked a turn ago, then a basket: "التانية" → "اه بدي ٢ كيلو لحمة".
  const picked = focusedPosition(ctx);
  if (picked && !direct.some((i) => i.kind === 'order') && /\d|(?:^|\s)(?:نص|ربع|كيلو|علبه)/u.test(answer) && !pointerIn(answer, listLength)) {
    const items = parseBasket(answer.replace(/(?:^|\s)(?:ابي|ابغى|بدي|اطلب|اطلبلي|منه|منها)(?=\s|$)/gu, ' '), ORDER_DEPS);
    const order = items.length ? validateIntent({ kind: 'order', referencedPosition: picked, placeName: ctx.lastResults?.items[picked - 1]?.name ?? null, orderItems: items }) : null;
    if (order) return [order];
  }

  // Pointing at the list: "التاني", "الأول كم يبعد؟".
  const pointer = listLength ? pointerIn(text, listLength) : null;
  const search = previousSearch(ctx);

  // "مين فيهم شغال الحين؟", "مين فيهم سعره معقول؟": the list, re-ranked.
  if (search && WHICH_RE.test(text) && !direct.some((i) => i.kind === 'order' || (i.kind === 'professional' && i.profession !== search.profession))) {
    const refined = validateIntent({ ...search, rank: rankIn(text) });
    if (refined) return [refined];
  }
  // "بلاش اروح، بدي فني يجي يشوفها بالبيت": the trade instead of the shop.
  if (search && COMES_RE.test(text)) {
    const pro = PLACE_TO_PRO[key(searchTarget(search))];
    const named = direct.find((i) => i.kind === 'professional');
    if (pro && (!named || named.profession === 'handyman' || named.profession === 'cleaner')) {
      const intent = validateIntent({ kind: 'professional', profession: pro });
      if (intent) return [intent];
    }
  }
  // "كهرباء، البطارية تفصل" while looking for a garage: the car's electrician.
  if (search && CAR_SEARCH.has(key(searchTarget(search)))) {
    const swapped = direct.map((i) => (i.kind === 'professional' && i.profession === 'electrician' ? validateIntent({ kind: 'professional', profession: 'auto_electrician' }) ?? i : i));
    if (swapped.some((i, k) => i !== direct[k])) return swapped;
  }
  if (pointer && !direct.some((i) => i.kind === 'order') && !COMPARE_RE.test(text)) {
    const others = direct.filter((i) => !search || key2(i) !== key2(search));
    if (search) {
      const pointed = validateIntent({ ...search, referencedPosition: pointer, brandHint: null });
      if (pointed) return [pointed, ...others].slice(0, MAX_INTENTS);
    }
  }

  // Refining the search before: "في ارخص؟", "بس اللي فاتح هلأ", "الاعلى
  // تقييم" — alone, or before a new request ("الارخص فيهم وكمان ابي خياط").
  if (search && !direct.some((i) => i.kind === 'order')) {
    const refineAt = REFINE_RE.exec(text)?.index ?? -1;
    const newAt = hasPlace ? firstHitAt(text) : Infinity;
    if (refineAt >= 0 && refineAt < newAt) {
      const head = Number.isFinite(newAt) ? text.slice(0, newAt) : text;
      const others = direct.filter((i) => key2(i) !== key2(search));
      // "المفتوح الحين صيدلية؟": the rank is for the new place, not the old list.
      if (others.length && !JOINER_RE.test(head) && !contextualOnly(text)) {
        return others.map((i) => (i.kind === 'place' ? validateIntent({ ...i, rank: rankIn(text) }) ?? i : i));
      }
      const refined = validateIntent({ ...search, rank: rankIn(head) });
      if (refined) return [refined, ...(contextualOnly(text) ? [] : others)].slice(0, MAX_INTENTS);
    }
  }

  // Answering Rico's question ("وش تبي بالضبط؟" → "مندي") reads fine alone;
  // when it doesn't, read it together with what the customer asked before.
  if (!direct.length && !CLOSERS_RE.test(text)) {
    if (lastUser && text.split(' ').length <= 4) {
      const joined = keywordClassify(`${lastUser} ${message}`);
      const before = keywordClassify(lastUser).map(key2);
      // Only if the answer added something: otherwise it's just the old request.
      if (joined.some((i) => !before.includes(key2(i)))) return joined;
    }
  }
  return direct;
}

/** "في وحدة اقرب؟ انا هلأ عند مستشفى الخالدي": every place named is only
 * where the customer is, not what they want. */
function contextualOnly(text: string): boolean {
  const hits = pick(findHits(text), false).filter((h) => h.target.type !== 'deals');
  return hits.length > 0 && hits.every((h) => h.contextual || h.modifier);
}

/** The table target an intent came from, for looking it up by key(). */
function searchTarget(i: Intent): Target {
  if (i.kind === 'professional') return { type: 'pro', slug: i.profession! };
  if (i.category === 'other' && i.customTag) return { type: 'free', place: { key: i.customTag.key as FreePlace['key'], value: i.customTag.value, label: i.label ?? '', words: [] } };
  return { type: 'fixed', slug: i.category ?? '' };
}

/** Where the first request word sits, for telling a refinement before it
 * from one after it. */
function firstHitAt(text: string): number {
  const hits = pick(findHits(text), false).filter((h) => h.target.type !== 'deals');
  return hits.length ? hits[0].start : Infinity;
}

function key2(i: Intent): string {
  return `${i.kind}:${i.category ?? ''}:${i.customTag?.value ?? ''}:${i.profession ?? ''}`;
}
