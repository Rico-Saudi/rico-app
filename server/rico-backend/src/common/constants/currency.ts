// The currency this deployment's shops price in. A product's price is a bare
// number with no currency of its own, so every place that prints one, or
// stamps a currency on a new deal, has to get it from here — a hand-written
// "ر.س" anywhere means a Jordanian shop's prices read as riyals.
//
// This branch is the Jordan (تدلل) deployment, hence JOD; DEFAULT_CURRENCY
// overrides it without a code change.
export const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'JOD';

const CURRENCY_LABELS: Record<string, string> = {
  JOD: 'دينار',
  SAR: 'ريال',
};

/** The Arabic name for an ISO code; an unknown code is returned as-is rather
 * than guessed at. */
export function currencyLabel(code?: string | null): string {
  const resolved = code || DEFAULT_CURRENCY;
  return CURRENCY_LABELS[resolved] ?? resolved;
}

/** "1.25 دينار" — whole amounts without decimals, fractions to at most three
 * places (a dinar is 1000 fils, so 0.350 is an ordinary price). */
export function formatPrice(amount: number, code?: string | null): string {
  const text = Number.isInteger(amount) ? String(amount) : String(Number(amount.toFixed(3)));
  return `${text} ${currencyLabel(code)}`;
}
