// Rule-based query parser for the product-catalog search MVP. Deliberately
// has ZERO Nest/DI dependencies — plain, synchronous, unit-testable on its
// own (see query-parser.spec.ts). SearchService imports and calls this as a
// plain function rather than injecting it.
//
// Pipeline (per the design principle: don't reach for an LLM before the
// simple layer is proven): normalize -> price-intent detection -> category
// dictionary match -> attribute dictionary match -> fuzzy typo correction
// for anything left unmatched -> whatever tokens remain become the
// free-text keyword search term.

import { closest, distance } from 'fastest-levenshtein';
import { CATEGORY_DICTIONARY, findCategoryByKeyword } from './dictionaries/categories.dict';
import { allAttributeKeywords, ATTRIBUTE_DICTIONARY, findAttributeByKeyword } from './dictionaries/attributes.dict';

export type SortOrder = 'price_asc' | 'price_desc' | 'distance' | 'relevance';

export interface ParsedQuery {
  category?: string;
  keyword?: string;
  attributes: Record<string, string>;
  sort: SortOrder;
}

const CHEAPEST_RE = /(cheapest|أرخص|ارخص|الأرخص|الارخص|أوفر|اوفر)/;
const PRICIEST_RE = /(most expensive|priciest|الأغلى|الاغلى|أغلى|اغلى)/;

// A typo is "close" if the edit distance is small relative to the token's
// own length — a fixed absolute threshold would either reject typos in long
// words or over-match short ones.
const FUZZY_MAX_DISTANCE_RATIO = 0.34;

function normalize(text: string): string {
  return text
    .toLowerCase()
    // strip Arabic diacritics (tashkeel) so "شَاوِرْمَا" ~ "شاورما"
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g, '')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[\s,،؛;]+/)
    .filter(Boolean);
}

function fuzzyMatch(token: string, candidates: string[]): string | null {
  if (!candidates.length) return null;
  const match = closest(token, candidates);
  const maxDistance = Math.max(1, Math.floor(match.length * FUZZY_MAX_DISTANCE_RATIO));
  return distance(token, match) <= maxDistance ? match : null;
}

export function parseQuery(rawText: string): ParsedQuery {
  const tokens = tokenize(rawText);
  const attributes: Record<string, string> = {};
  let category: string | undefined;
  let sort: SortOrder = 'relevance';

  const leftover: string[] = [];
  const allCategoryKeywords = CATEGORY_DICTIONARY.flatMap((c) => c.keywords);
  const allAttrKeywords = allAttributeKeywords();

  for (const token of tokens) {
    if (CHEAPEST_RE.test(token)) {
      sort = 'price_asc';
      continue;
    }
    if (PRICIEST_RE.test(token)) {
      sort = 'price_desc';
      continue;
    }

    const categoryMatch = findCategoryByKeyword(token);
    if (categoryMatch) {
      category = categoryMatch.slug;
      continue;
    }

    const attrMatch = findAttributeByKeyword(token);
    if (attrMatch) {
      attributes[attrMatch.key] = attrMatch.value;
      continue;
    }

    // Fuzzy fallback — only reached if no exact match was found above, so a
    // correctly-spelled word never pays the fuzzy-matching cost.
    const fuzzyCategory = fuzzyMatch(token, allCategoryKeywords);
    if (fuzzyCategory) {
      const entry = findCategoryByKeyword(fuzzyCategory);
      if (entry) {
        category = entry.slug;
        continue;
      }
    }

    const fuzzyAttr = fuzzyMatch(token, allAttrKeywords);
    if (fuzzyAttr) {
      const entry = findAttributeByKeyword(fuzzyAttr);
      if (entry) {
        attributes[entry.key] = entry.value;
        continue;
      }
    }

    leftover.push(token);
  }

  // Also check whole-phrase price-intent (e.g. "الأرخص" spanning what
  // tokenize split, or appearing attached to punctuation already stripped).
  const normalizedWhole = normalize(rawText);
  if (sort === 'relevance' && CHEAPEST_RE.test(normalizedWhole)) sort = 'price_asc';
  if (sort === 'relevance' && PRICIEST_RE.test(normalizedWhole)) sort = 'price_desc';

  return {
    category,
    keyword: leftover.length ? leftover.join(' ') : undefined,
    attributes,
    sort,
  };
}
