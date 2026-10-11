import { currencyLabel, DEFAULT_CURRENCY, formatPrice } from './currency';

describe('currency', () => {
  it('defaults to the Jordanian dinar on this deployment', () => {
    expect(DEFAULT_CURRENCY).toBe('JOD');
    expect(currencyLabel()).toBe('دينار');
    expect(currencyLabel('SAR')).toBe('ريال');
  });

  it('returns an unknown code as-is rather than guessing a name', () => {
    expect(currencyLabel('EUR')).toBe('EUR');
  });

  // A dinar is 1000 fils, so rounding to whole units would mislabel most
  // café and bakery prices.
  it('keeps fils and drops trailing zeros', () => {
    expect(formatPrice(12)).toBe('12 دينار');
    expect(formatPrice(0.75)).toBe('0.75 دينار');
    expect(formatPrice(0.125)).toBe('0.125 دينار');
    expect(formatPrice(0.1 + 0.2)).toBe('0.3 دينار');
  });
});
