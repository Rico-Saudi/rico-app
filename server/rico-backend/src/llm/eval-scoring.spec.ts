import { CASES, matches, scoreCase } from '../../scripts/eval-classify';

// If the scorer is wrong, every model comparison it produces is wrong — and
// wrong in a way that looks like data. So it gets tested before it is trusted.
describe('classify eval scoring', () => {
  const place = (category: string, rank = 'nearest') => ({ kind: 'place', category, rank, profession: null });

  it('accepts an intent that matches every field named', () => {
    expect(matches(place('restaurant'), { kind: 'place', category: 'restaurant', rank: 'nearest' })).toBe(true);
  });

  it('ignores fields the expectation leaves out', () => {
    // Most cases care about the category, not whether a rank was also guessed.
    expect(matches(place('cafe', 'cheapest'), { kind: 'place', category: 'cafe' })).toBe(true);
  });

  it('rejects the painter/paint-shop confusion', () => {
    // The distinction the classifier exists to protect: a person vs a shop.
    const paintShop = { kind: 'place', category: 'other', profession: null };
    expect(matches(paintShop, { kind: 'professional', profession: 'painter' })).toBe(false);
  });

  it('is order-insensitive across a multi-intent answer', () => {
    const got = [place('cafe'), place('restaurant')];
    expect(scoreCase(got, [{ kind: 'place', category: 'restaurant' }, { kind: 'place', category: 'cafe' }])).toBe(true);
  });

  it('gives no partial credit for dropping one of several requests', () => {
    // The exact failure the system prompt calls a recurring error, so it must
    // score as a miss rather than 2-out-of-3.
    const got = [place('restaurant'), place('cafe')];
    const want = [
      { kind: 'place' as const, category: 'restaurant' },
      { kind: 'place' as const, category: 'cafe' },
      { kind: 'deals' as const },
    ];
    expect(scoreCase(got, want)).toBe(false);
  });

  it('does not let one returned intent satisfy two expectations', () => {
    expect(scoreCase([place('cafe')], [{ kind: 'place', category: 'cafe' }, { kind: 'place', category: 'cafe' }])).toBe(false);
  });

  it('treats an empty result as correct only for an off-topic case', () => {
    expect(scoreCase([], [])).toBe(true);
    expect(scoreCase([], [{ kind: 'place', category: 'restaurant' }])).toBe(false);
    expect(scoreCase([place('restaurant')], [])).toBe(false);
  });

  it('covers the cases that actually regressed before', () => {
    const messages = CASES.map((c) => c.message);
    expect(messages).toContain('هلا'); // greeting became a restaurant search
    expect(messages).toContain('أبغى دهان'); // painter vs paint shop
    expect(CASES.filter((c) => c.expect.length > 1).length).toBeGreaterThan(0); // multi-intent
    expect(CASES.filter((c) => c.brand === 'tadallal').length).toBeGreaterThan(0); // Jordanian
  });
});
