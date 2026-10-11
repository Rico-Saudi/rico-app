// The registry is how the fallback learns the shops Rico actually has
// (ShopNamesService fills it from the database). These lock in what it adds
// — orders and searches by a shop's real name — and what it must not:
// a generic or common name turning ordinary sentences into searches.
import { isGenericWord, keywordClassify } from './keyword-classifier';
import { shopRegistry } from './shop-registry';

const shops = [
  { name: 'مطعم تاج محل', category: 'restaurant', hasMenu: true },
  { name: 'بقالة ابو احمد', category: 'supermarket', hasMenu: true },
  { name: 'صيدلية الشفاء', category: 'pharmacy', hasMenu: true },
  { name: 'صيدلية', category: 'pharmacy', hasMenu: false },
  { name: 'الشفاء', category: 'pharmacy', hasMenu: false },
  { name: 'Shawarma House', category: 'restaurant', hasMenu: false },
];
const products = ['بتر تشكن', 'خبز نان', 'برياني دجاج', 'لبنة بلدي'];

describe('shop registry', () => {
  beforeAll(() => shopRegistry.replaceAll(shops, products, isGenericWord));
  afterAll(() => shopRegistry.replaceAll([], [], isGenericWord));

  it('reads an order from a shop it only knows from the database', () => {
    expect(keywordClassify('اطلب لي من تاج محل بتر تشكن و٢ خبز نان')).toEqual([
      expect.objectContaining({
        kind: 'order',
        placeName: 'مطعم تاج محل',
        orderItems: [
          { name: 'بتر تشكن', quantity: 1 },
          { name: 'خبز نان', quantity: 2 },
        ],
      }),
    ]);
    expect(keywordClassify('من بقالة ابو احمد ربطة خبز وعلبة لبنة')).toEqual([
      expect.objectContaining({ kind: 'order', placeName: 'بقالة ابو احمد' }),
    ]);
  });

  it('searches for a known shop by its name, in its category', () => {
    expect(keywordClassify('وين مطعم تاج محل')).toEqual([
      expect.objectContaining({ kind: 'place', category: 'restaurant', brandHint: 'مطعم تاج محل' }),
    ]);
    expect(keywordClassify('وين صيدلية الشفاء')).toEqual([
      expect.objectContaining({ kind: 'place', category: 'pharmacy', brandHint: 'صيدلية الشفاء' }),
    ]);
  });

  it('ignores names that are only a generic or common word', () => {
    expect(keywordClassify('بدي صيدلية')).toEqual([expect.objectContaining({ category: 'pharmacy', brandHint: null })]);
    expect(keywordClassify('الله يعطيك الشفاء')).toEqual([]);
  });

  it('builds a city of shops fast enough to refresh in the background', () => {
    const many = Array.from({ length: 30_000 }, (_, i) => ({ name: `مطعم رقم ${i} الشامي`, category: 'restaurant', hasMenu: i % 3 === 0 }));
    const started = Date.now();
    shopRegistry.replaceAll(many, products, isGenericWord);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(shopRegistry.size).toBeGreaterThan(20_000);
    shopRegistry.replaceAll(shops, products, isGenericWord);
  });
});
