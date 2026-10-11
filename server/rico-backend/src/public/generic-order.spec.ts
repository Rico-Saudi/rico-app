import { readGenericItem } from './generic-order.util';

// The line between "the customer named a dish" and "the customer handed me
// the choice". Getting it wrong in either direction is a real failure:
// reading a real dish as a hand-over serves them something they didn't ask
// for, and reading a hand-over as a dish answers "ما لقيت وجبة عندهم".
describe('readGenericItem', () => {
  const generic = (name: string) => readGenericItem(name);

  describe('reads as a hand-over', () => {
    const handOvers = [
      'وجبة',
      'وجبه',
      'وجبات',
      'أكلة',
      'اكله',
      'أكل',
      'طعام',
      'أي شي',
      'اي شيء',
      'أي وجبة',
      'وجبة من عندك',
      'اللي تشوفه',
      'أي شي عندكم',
      'وجبة لو سمحت',
      'غداء',
      'عشاء',
    ];
    for (const name of handOvers) {
      it(`"${name}"`, () => expect(generic(name).isGeneric).toBe(true));
    }
  });

  describe('reads as a named dish', () => {
    // Every one of these names something a menu can actually have, and the
    // normal matcher must get the chance to find it.
    const named = [
      'وجبة عائلية',
      'وجبة أطفال',
      'وجبة الفطور الإنجليزي',
      'شاورما',
      'كنافة نابلسية',
      'أكل بيتي',
      'طعام هندي',
      'بطاطس',
      'قهوة',
    ];
    for (const name of named) {
      it(`"${name}"`, () => expect(generic(name).isGeneric).toBe(false));
    }

    it('empty and whitespace are not a hand-over either', () => {
      expect(generic('').isGeneric).toBe(false);
      expect(generic('   ').isGeneric).toBe(false);
    });
  });

  describe('qualifiers', () => {
    it('reads a budget', () => {
      expect(generic('أرخص وجبة')).toEqual({ isGeneric: true, prefer: 'cheapest' });
      expect(generic('وجبة رخيصة')).toEqual({ isGeneric: true, prefer: 'cheapest' });
      expect(generic('أي شي أوفر')).toEqual({ isGeneric: true, prefer: 'cheapest' });
    });

    it('reads a request for their best', () => {
      expect(generic('أحلى وجبة')).toEqual({ isGeneric: true, prefer: 'best' });
      expect(generic('أشهر أكلة عندهم')).toEqual({ isGeneric: true, prefer: 'best' });
    });

    it('defaults to no preference', () => {
      expect(generic('وجبة')).toEqual({ isGeneric: true, prefer: 'any' });
    });

    // Overspending on someone's behalf is the worse miss of the two.
    it('lets the budget win a contradiction', () => {
      expect(generic('أرخص وأحلى وجبة').prefer).toBe('cheapest');
    });

    // A qualifier with nothing to qualify is a dish name, not a hand-over:
    // "أرخص شاورما" is a real request for shawarma.
    it('needs a generic noun, not just a qualifier', () => {
      expect(generic('أرخص').isGeneric).toBe(false);
      expect(generic('أحلى').isGeneric).toBe(false);
      expect(generic('أرخص شاورما').isGeneric).toBe(false);
    });
  });
});
