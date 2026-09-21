/**
 * Folds two ways of typing the same question into one string.
 *
 * The gap log is only useful if "بدي بويلرجي" and "بدي بويلرجى!!" are one row
 * with count=2 rather than two rows with count=1 — a list where every line
 * says "asked once" tells nobody what to teach Rico next. Arabic makes that
 * folding necessary rather than optional: the same word is written with and
 * without hamza, with ة or ه at the end, with ى or ي, with diacritics or
 * without, and every one of those is the same question to the person who
 * typed it.
 *
 * This is deliberately lossy and is never shown to anyone — the raw message
 * is stored alongside it for that.
 */

// Tashkeel, dagger alif, and the tatweel used to stretch a word visually.
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

// Arabic-Indic and extended Arabic-Indic digits, in order 0-9.
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

// Anything that isn't a letter, a digit, or a space: punctuation, emoji, the
// repeated ؟؟؟ and !!! that carry tone but not meaning.
const NON_WORD = /[^\p{L}\p{N}\s]/gu;

function foldLetters(s: string): string {
  return s
    .replace(/[آأإاٱ]/g, 'ا') // آ أ إ ا ٱ
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي'); // ئ → ي
}

export function normalizeArabic(raw: string): string {
  return foldLetters(raw.replace(DIACRITICS, ''))
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(NON_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
