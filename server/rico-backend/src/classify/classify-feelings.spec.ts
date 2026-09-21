// "أنا جوعان" / "أنا رهقان" / "أنا زعلان" are how people actually open a
// conversation, and the two failure modes are opposite: ignoring the message,
// or guessing a category off a feeling and answering sadness with a sweet
// shop. Both dialects have to carry the same rule, so this locks the section
// into each of them — a prompt edit that drops it from one is the bug this
// file exists to catch.
import { buildSystemPrompt } from './constants/classify.constants';
import { brandFor } from '../common/constants/brands';

describe('classify prompt: feelings and bodily states', () => {
  const prompts = {
    saudi: buildSystemPrompt(brandFor('rico')),
    jordanian: buildSystemPrompt(brandFor('tadallal')),
  };

  for (const [dialect, prompt] of Object.entries(prompts)) {
    describe(dialect, () => {
      it('has the section at all', () => {
        expect(prompt).toContain('# الحالة الجسدية والمشاعر');
      });

      it('routes an unmistakable bodily need straight to a search', () => {
        expect(prompt).toContain('جوعان');
        expect(prompt).toContain('category="restaurant"');
        expect(prompt).toContain('عطشان');
        expect(prompt).toContain('category="cafe"');
      });

      it('forbids turning a feeling into a single category', () => {
        expect(prompt).toContain('ممنوع تخمّن فئة لشعور');
      });

      it('answers severe distress with care, not with a list of cafés', () => {
        expect(prompt).toContain('أذية النفس');
        expect(prompt).toContain('دكتور');
      });

      it('treats a feeling plus a real request as the request', () => {
        // "زعلان وبدي كافيه" names a category, so it is a search — the
        // empathy path is for a feeling with nothing to search for.
        expect(prompt).toContain('مع طلب واضح');
      });

      // Each of these was a wrong answer the live model actually gave before
      // the rule existed — see the probe notes in the PR.
      it('does not offer something hot to someone who is too hot', () => {
        expect(prompt).toMatch(/ممنوع تعرض (إشي|شي) سخن/);
      });

      it('congratulates rather than consoles a happy customer', () => {
        expect(prompt).toContain('ممنوع دعاء الهمّ');
        expect(prompt).toContain('مبروك');
      });

      it('keeps boredom out of the feelings path', () => {
        // "طفشان" was being answered with "الله يفرّج همّك" and a grief list.
        expect(prompt).toContain('والملل م');
        expect(prompt).toContain('دعاء حزن');
      });

      it('never offers back what the customer just ruled out', () => {
        expect(prompt).toContain('رفضه صراحةً');
      });

      it('leaves someone unwell the choice between pharmacy, clinic and hospital', () => {
        // The model answered "أنا مريض" with a pharmacy search until the rule
        // said, in as many words, that this one does not become a search.
        expect(prompt).toMatch(/ما (بتروح|تروح) بحث/);
        // The one mapping we deliberately refuse to make: a painkiller and a
        // doctor are not interchangeable, and guessing here can do harm.
        expect(prompt).toContain('💊 صيدلية، 🏥 عيادة، 🏥 مستشفى');
      });
    });
  }

  it('keeps the two dialects the same size, so neither drifts alone', () => {
    const count = (p: string) => (p.match(/→ category="/g) || []).length;
    expect(count(prompts.saudi)).toBe(count(prompts.jordanian));
  });
});
