import { parseQuery } from './query-parser';

describe('parseQuery', () => {
  it('detects price-intent phrases in Arabic', () => {
    expect(parseQuery('أرخص شاورما').sort).toBe('price_asc');
    expect(parseQuery('ابغى شاورما ارخص').sort).toBe('price_asc');
  });

  it('detects price-intent phrases in English', () => {
    expect(parseQuery('cheapest shawarma').sort).toBe('price_asc');
  });

  it('matches a known category keyword', () => {
    expect(parseQuery('شاورما').category).toBe('food');
    expect(parseQuery('pizza').category).toBe('food');
    expect(parseQuery('تيشيرت اسود').category).toBe('clothing');
  });

  it('matches known attribute keywords', () => {
    const parsed = parseQuery('تيشيرت اسود');
    expect(parsed.attributes.color).toBe('black');
  });

  it('matches multiple attributes at once', () => {
    const parsed = parseQuery('قميص أسود مقاس كبير');
    expect(parsed.attributes.color).toBe('black');
    expect(parsed.attributes.size).toBe('large');
  });

  it('fuzzy-corrects a single-character typo against the category dictionary', () => {
    // "شورما" is missing the alef from "شاورما" — a one-edit typo.
    expect(parseQuery('شورما').category).toBe('food');
  });

  it('fuzzy-corrects a typo against the attribute dictionary', () => {
    expect(parseQuery('تيشيرت اسو').attributes.color).toBe('black');
  });

  it('leaves unmatched tokens as the free-text keyword', () => {
    const parsed = parseQuery('ستاربكس');
    expect(parsed.keyword).toBe('ستاربكس');
    expect(parsed.category).toBeUndefined();
  });

  it('defaults sort to relevance with no price-intent', () => {
    expect(parseQuery('شاورما').sort).toBe('relevance');
  });
});
