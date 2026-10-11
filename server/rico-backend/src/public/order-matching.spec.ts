import { bestMatch, normalizeArabic, similarity } from './order-matching.util';

// The real menu these are matched against, so the tests exercise the actual
// discrimination problem: several shawarmas, several salads, two desserts.
const MENU = [
  { id: '1', name: 'شاورما سوبر' },
  { id: '2', name: 'شاورما عادي' },
  { id: '3', name: 'شيش طاووق' },
  { id: '4', name: 'كباب لحم' },
  { id: '5', name: 'ريش غنم' },
  { id: '6', name: 'فروج مشوي كامل' },
  { id: '7', name: 'شاورما دجاج صحن' },
  { id: '8', name: 'شاورما لحم عربي' },
  { id: '9', name: 'وجبة برجر لحم' },
  { id: '10', name: 'حمص بالطحينة' },
  { id: '11', name: 'سلطة فتوش' },
  { id: '12', name: 'سلطة تبولة' },
  { id: '13', name: 'بطاطس مقلية' },
  { id: '14', name: 'عصير برتقال طازج' },
  { id: '15', name: 'كنافة نابلسية' },
  { id: '16', name: 'أرز بحليب' },
];

const matchName = (q: string) => bestMatch(q, MENU)?.item.name ?? null;

describe('normalizeArabic', () => {
  it('erases the spelling differences people actually make', () => {
    expect(normalizeArabic('أرز')).toBe(normalizeArabic('ارز'));
    expect(normalizeArabic('كنافة')).toBe(normalizeArabic('كنافه'));
    expect(normalizeArabic('نابلسيّة')).toBe(normalizeArabic('نابلسيه'));
    expect(normalizeArabic('شــاورما')).toBe(normalizeArabic('شاورما'));
    expect(normalizeArabic('٣')).toBe('3');
  });

  it('drops punctuation and collapses spacing', () => {
    expect(normalizeArabic('  كنافة،  نابلسية! ')).toBe('كنافه نابلسيه');
  });
});

describe('bestMatch against a real menu', () => {
  it('matches what the customer literally said', () => {
    expect(matchName('كنافة نابلسية')).toBe('كنافة نابلسية');
    expect(matchName('أرز بحليب')).toBe('أرز بحليب');
  });

  it('matches despite spelling and diacritics', () => {
    expect(matchName('كنافه نابلسيه')).toBe('كنافة نابلسية');
    expect(matchName('ارز بحليب')).toBe('أرز بحليب');
    expect(matchName('كنافةً نابلسيّة')).toBe('كنافة نابلسية');
  });

  it('matches a partial name to its full item', () => {
    expect(matchName('كنافة')).toBe('كنافة نابلسية');
    expect(matchName('تبولة')).toBe('سلطة تبولة');
    expect(matchName('فتوش')).toBe('سلطة فتوش');
    expect(matchName('بطاطس')).toBe('بطاطس مقلية');
  });

  it('tolerates the definite article the menu omits', () => {
    expect(matchName('الكنافة')).toBe('كنافة نابلسية');
    expect(matchName('البطاطس')).toBe('بطاطس مقلية');
  });

  it('picks the right one among several shawarmas', () => {
    expect(matchName('شاورما دجاج')).toBe('شاورما دجاج صحن');
    expect(matchName('شاورما لحم عربي')).toBe('شاورما لحم عربي');
    expect(matchName('شاورما سوبر')).toBe('شاورما سوبر');
  });

  it('refuses things the shop does not sell', () => {
    expect(matchName('بيتزا مارجريتا')).toBeNull();
    expect(matchName('سوشي')).toBeNull();
    expect(matchName('قهوة تركية')).toBeNull();
  });

  it('does not confuse two different dishes that merely look alike', () => {
    // كباب/كنافة share letters; edit distance alone would rate them close.
    expect(similarity('كنافة', 'كباب لحم')).toBeLessThan(0.6);
    expect(matchName('كباب')).toBe('كباب لحم');
  });

  it('returns null rather than guessing on an empty or junk query', () => {
    expect(bestMatch('', MENU)).toBeNull();
    expect(bestMatch('   ', MENU)).toBeNull();
    expect(matchName('؟؟؟')).toBeNull();
  });

  it('scores an exact match above a partial one', () => {
    expect(similarity('كنافة نابلسية', 'كنافة نابلسية')).toBe(1);
    expect(similarity('كنافة', 'كنافة نابلسية')).toBeLessThan(1);
    expect(similarity('كنافة', 'كنافة نابلسية')).toBeGreaterThan(0.6);
  });
});
