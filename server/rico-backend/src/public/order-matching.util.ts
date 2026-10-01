import { distance } from 'fastest-levenshtein';

// Matching a spoken order ("كنافة نابلسية") to a catalogue row ("كنافة
// نابلسية") is not string equality: people drop the definite article, spell
// hamza and taa marbuta inconsistently, and type without diacritics. Every
// comparison here runs on a normalized form so those differences stop being
// differences.

const DIACRITICS = /[ً-ْٰـ]/g;

export function normalizeArabic(input: string): string {
  return input
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    // Arabic-Indic digits, so "٣" and "3" compare equal.
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// "الكنافة" and "كنافة" are the same word. Only stripped from tokens long
// enough to survive it, so "ألو" or a genuine word starting with ال isn't
// mangled into something shorter and wrong.
function stripArticle(token: string): string {
  return token.length > 4 && token.startsWith('ال') ? token.slice(2) : token;
}

export function tokenize(input: string): string[] {
  return normalizeArabic(input).split(' ').filter(Boolean).map(stripArticle);
}

function levenshteinRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const longest = Math.max(a.length, b.length);
  return 1 - distance(a, b) / longest;
}

/**
 * How well a requested name matches a catalogue name, 0..1.
 *
 * Deliberately generous about extra words on either side: a customer saying
 * "كنافة" should match "كنافة نابلسية", and one saying "كنافة نابلسية بالجبن"
 * should match it too. What it must not do is match "كنافة" to "كباب" — hence
 * the token floor before edit distance gets a vote.
 */
export function similarity(query: string, candidate: string): number {
  const q = normalizeArabic(query);
  const c = normalizeArabic(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;

  const qTokens = tokenize(query);
  const cTokens = tokenize(candidate);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  const qJoined = qTokens.join(' ');
  const cJoined = cTokens.join(' ');
  if (qJoined === cJoined) return 0.99;

  // Every word the customer said appears in the item (or vice versa): this is
  // the "كنافة" -> "كنافة نابلسية" case, and it's a strong signal. Naming a
  // dish by part of its name is how people order, so the extra words on the
  // menu cost only a little — enough to rank a fuller match higher, not
  // enough to push a real match below the threshold.
  const cSet = new Set(cTokens);
  const qSet = new Set(qTokens);
  const shared = qTokens.filter((t) => cSet.has(t)).length;
  if (shared === qTokens.length || shared === cTokens.length) {
    return 0.75 + 0.25 * (Math.min(qSet.size, cSet.size) / Math.max(qSet.size, cSet.size));
  }

  const overlap = shared / Math.max(qSet.size, cSet.size);
  const edit = levenshteinRatio(qJoined, cJoined);

  // Edit distance alone happily rates "كنافة" against "كباب" at ~0.4, which is
  // why it only contributes once at least one whole word is shared.
  return shared > 0 ? Math.max(overlap, edit) : edit * 0.5;
}

export interface Candidate {
  id: string;
  name: string;
}

export interface MatchResult<T extends Candidate> {
  item: T;
  score: number;
}

/** Score at or above which a request IS the catalogue row, no question asked. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Score below MATCH_THRESHOLD but worth offering as "did you mean ...?".
 *
 * The band is wide enough to catch a real near-miss and narrow enough to stay
 * quiet on a genuine absence. Measured against a five-row menu: a customer
 * saying "بودنغ أرز" scores 0.5 on "أرز بحليب", while an item the shop truly
 * has nothing like lands at 0.13 and below. Suggesting the closest row at 0.13
 * would be noise — the point of the floor is that silence beats a bad guess.
 */
export const SUGGESTION_THRESHOLD = 0.35;

/**
 * Closest candidate however weak the match — the caller decides what to do
 * with a weak one.
 *
 * Split out from [bestMatch] because throwing the score away is what forced
 * "ما لقيت X" on a request the catalogue almost answered: the work of finding
 * the nearest row was already done, and only the threshold check discarded it.
 */
export function closestMatch<T extends Candidate>(query: string, candidates: T[]): MatchResult<T> | null {
  let best: MatchResult<T> | null = null;
  for (const item of candidates) {
    const score = similarity(query, item.name);
    if (score > (best?.score ?? 0)) best = { item, score };
  }
  return best;
}

/** Best candidate above the threshold, or null when nothing is close enough. */
export function bestMatch<T extends Candidate>(
  query: string,
  candidates: T[],
  threshold = MATCH_THRESHOLD,
): MatchResult<T> | null {
  const closest = closestMatch(query, candidates);
  return closest && closest.score >= threshold ? closest : null;
}
