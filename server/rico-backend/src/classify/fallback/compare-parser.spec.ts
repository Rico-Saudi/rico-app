import { parseCompare } from './compare-parser';
import { keywordClassify } from './keyword-classifier';

describe('parseCompare', () => {
  const items = (message: string) => parseCompare(message)?.orderItems?.map((i) => i.name) ?? null;

  it.each([
    ['ريكو بدي اشتري جبنة قارن وين ارخص جبنة', ['جبنة']],
    ['قارن لي وين أرخص جبنة', ['جبنة']],
    ['وين ألقى أرخص حليب؟', ['حليب']],
    ['مين أرخص بالشاورما', ['شاورما']],
    ['قارن اسعار الحليب والجبنة', ['حليب', 'جبنة']],
    ['قارنلي سعر الرز', ['رز']],
    ['وين ارخص جبنة شيدر', ['جبنة شيدر']],
  ])('"%s" compares %j', (message, expected) => {
    expect(items(message)).toEqual(expected);
  });

  it.each([
    // A kind of shop: a place search, not a product.
    'وين أرخص مطعم',
    'وين ارخص سوبرماركت قريب',
    'مين ارخص صيدلية',
    // No comparison asked.
    'بدي اشتري جبنة',
    'ارخص جبنة',
    'اطلب لي جبنة من بقالة النور',
    // Two shops the customer already has in mind.
    'مين ارخص، شاورما ريم ولا شاورما ابو جبارة؟',
    // A cue with nothing to compare.
    'قارن',
    'وين الارخص',
  ])('"%s" is not a comparison', (message) => {
    expect(parseCompare(message)).toBeNull();
  });

  it('wins over the order parser and the cheapest-shop search', () => {
    expect(keywordClassify('بدي اشتري جبنة قارن وين ارخص جبنة')).toEqual([
      expect.objectContaining({ kind: 'compare', orderItems: [{ name: 'جبنة', quantity: 1 }] }),
    ]);
  });
});
