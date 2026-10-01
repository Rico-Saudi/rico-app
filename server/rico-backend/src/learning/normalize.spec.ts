// The gap log is only readable if the same question lands on one row. Arabic
// gives the same word several spellings, so these lock in the folding that
// makes "بدي بويلرجي" and "بِدّي بويلرجى!!" count as one question asked twice.
import { normalizeArabic } from './constants/normalize';

describe('normalizeArabic', () => {
  const same = (a: string, b: string) => expect(normalizeArabic(a)).toBe(normalizeArabic(b));

  it('folds the alef family', () => {
    same('أقرب مطعم', 'اقرب مطعم');
    same('إشي حلو', 'اشي حلو');
    same('آخر عرض', 'اخر عرض');
  });

  it('folds ة/ه and ى/ي', () => {
    same('صيدلية', 'صيدليه');
    same('مستشفى', 'مستشفي');
  });

  it('ignores diacritics and tatweel', () => {
    same('بِدِّي كَهْرَبْجي', 'بدي كهربجي');
    same('مــــرحبا', 'مرحبا');
  });

  it('drops punctuation and emoji, and collapses spacing', () => {
    same('وين أقرب صيدلية؟؟؟', 'وين   أقرب صيدلية');
    same('بدي كهربجي 🙏', 'بدي كهربجي');
  });

  it('unifies Arabic-Indic digits with ASCII ones', () => {
    same('بدي ٣ شاورما', 'بدي 3 شاورما');
  });

  it('keeps genuinely different questions apart', () => {
    expect(normalizeArabic('بدي بويلرجي')).not.toBe(normalizeArabic('بدي كهربجي'));
  });

  it('returns empty for a message with nothing to learn from', () => {
    // LearningService.record drops these rather than storing a row keyed on
    // the empty string, which every one of them would collide on.
    expect(normalizeArabic('!!!')).toBe('');
    expect(normalizeArabic('😅😅')).toBe('');
    expect(normalizeArabic('   ')).toBe('');
  });
});
