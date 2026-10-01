import { signState, verifyState, StateError } from './oauth-state';
import { validateParsed } from './offer-parser';

// Two pieces carry the weight. The state binding is what stops a vendor's
// Instagram being attached to somebody else's shop, and the parser decides
// what gets shown to users as a discount. A mistake in the first is an account
// takeover; a mistake in the second is a price someone drives to.
describe('OAuth state', () => {
  const ACCOUNT = '65a1f2c3d4e5f6a7b8c9d0e1';
  const BUSINESS = '75b2e3d4c5f6a7b8c9d0e1f2';

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret';
  });

  it('round-trips the business it was minted for', () => {
    expect(verifyState(signState(ACCOUNT, BUSINESS), ACCOUNT)).toBe(BUSINESS);
  });

  it('refuses a state minted for a different account', () => {
    // The attack it exists to stop: handing a vendor a link that attaches
    // their Instagram to a business they do not own.
    const state = signState('someone-else', BUSINESS);
    expect(() => verifyState(state, ACCOUNT)).toThrow(StateError);
  });

  it('refuses a state whose business id was swapped after signing', () => {
    const decoded = Buffer.from(signState(ACCOUNT, BUSINESS), 'base64url').toString('utf8');
    const [account, , signature] = decoded.split(':');
    const tampered = Buffer.from(`${account}:attackers-business:${signature}`).toString('base64url');

    expect(() => verifyState(tampered, ACCOUNT)).toThrow(StateError);
  });

  it('refuses a signature forged under a different secret', () => {
    const state = signState(ACCOUNT, BUSINESS);
    process.env.SESSION_SECRET = 'a-different-secret';
    expect(() => verifyState(state, ACCOUNT)).toThrow(StateError);
    process.env.SESSION_SECRET = 'test-secret';
  });

  it('refuses malformed states instead of crashing', () => {
    for (const bad of ['', 'nonsense', Buffer.from('a:b').toString('base64url'), '!!!!']) {
      expect(() => verifyState(bad, ACCOUNT)).toThrow(StateError);
    }
  });
});

describe('caption parsing', () => {
  const offer = (overrides: Record<string, unknown> = {}) => ({
    isOffer: true,
    titleAr: 'خصم ٣٠٪ على القهوة',
    descriptionAr: null,
    dealType: 'percent',
    value: 30,
    promoCode: null,
    endsAt: null,
    ...overrides,
  });

  it('accepts a well-formed offer', () => {
    expect(validateParsed(offer())).toMatchObject({ titleAr: 'خصم ٣٠٪ على القهوة', dealType: 'percent', value: 30 });
  });

  it('drops a post the model judged not to be an offer', () => {
    // Most of a shop's feed: new arrivals, Eid greetings, hiring notices.
    expect(validateParsed({ isOffer: false })).toBeNull();
    expect(validateParsed({ isOffer: false, titleAr: 'منتج جديد', dealType: 'percent', value: 10 })).toBeNull();
  });

  it('drops an unknown deal type rather than guessing one', () => {
    expect(validateParsed(offer({ dealType: 'mystery' }))).toBeNull();
    expect(validateParsed(offer({ dealType: null }))).toBeNull();
  });

  it('rejects a percentage outside a believable range', () => {
    // 150% off is a misread of some other number in the caption.
    expect(validateParsed(offer({ value: 150 }))!.value).toBeNull();
    expect(validateParsed(offer({ value: 0 }))!.value).toBeNull();
    expect(validateParsed(offer({ value: -20 }))!.value).toBeNull();
  });

  it('keeps an offer whose amount was never stated', () => {
    // «خصومات كبيرة» is a real offer with no number — showing it without one
    // is honest; inventing 50% is not.
    const parsed = validateParsed(offer({ titleAr: 'خصومات كبيرة على كل الأصناف', value: null }));
    expect(parsed).not.toBeNull();
    expect(parsed!.value).toBeNull();
  });

  it('ignores an end date already in the past', () => {
    // Usually the model read a start date, or an old post.
    expect(validateParsed(offer({ endsAt: '2020-01-01' }))!.endsAt).toBeNull();
  });

  it('keeps a real future end date', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(validateParsed(offer({ endsAt: future }))!.endsAt).toBe(future);
  });

  it('ignores a malformed date', () => {
    expect(validateParsed(offer({ endsAt: 'next week' }))!.endsAt).toBeNull();
    expect(validateParsed(offer({ endsAt: '15-01-2026' }))!.endsAt).toBeNull();
  });

  it('drops an offer with no usable title', () => {
    expect(validateParsed(offer({ titleAr: '' }))).toBeNull();
    expect(validateParsed(offer({ titleAr: 'x'.repeat(200) }))).toBeNull();
  });

  it('keeps a promo code only when it is plausible', () => {
    expect(validateParsed(offer({ promoCode: 'RICO20' }))!.promoCode).toBe('RICO20');
    expect(validateParsed(offer({ promoCode: 'x'.repeat(100) }))!.promoCode).toBeNull();
    expect(validateParsed(offer({ promoCode: 42 }))!.promoCode).toBeNull();
  });

  it('survives junk instead of throwing', () => {
    for (const junk of [null, undefined, 'a string', 42, []]) {
      expect(validateParsed(junk)).toBeNull();
    }
  });
});
