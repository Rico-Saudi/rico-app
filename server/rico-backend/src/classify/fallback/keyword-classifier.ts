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
import { isOrderComplaint, OrderDeps, parseOrder } from './order-parser';
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
const FUZZY_STOP = foldedSet(FUZZY_STOPLIST);
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
  return chosen.filter((h) => !spans.some(([a, b]) => h.start >= a && h.start < b));
}

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

/** keywordClassify, reading the message in the conversation it belongs to. */
export function keywordClassifyInContext(message: string, ctx: ConversationContext): Intent[] {
  return keywordClassify(message);
}
