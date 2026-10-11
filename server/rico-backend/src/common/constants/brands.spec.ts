import { buildSystemPrompt } from '../../classify/constants/classify.constants';
import { buildComposePrompt } from '../../compose/constants/compose.constants';
import { buildVocabHint } from '../../transcribe/constants/transcribe.constants';
import { brandFor } from './brands';

// The regression this guards: the prompts used to hardcode one dialect, so
// whichever variant the deployment was built from answered for all of them —
// تدلل introducing itself by name and then speaking Saudi.
describe('per-brand dialect', () => {
  it('answers ريكو in Saudi', () => {
    const prompt = buildSystemPrompt(brandFor('rico'));
    expect(prompt).toContain('أنت "ريكو"، مساعد سعودي');
    expect(prompt).toContain('باللهجة السعودية بس');
    expect(buildComposePrompt(brandFor('rico'))).toContain('أنت "ريكو"، مساعد سعودي');
  });

  it('answers تدلل in Jordanian', () => {
    const prompt = buildSystemPrompt(brandFor('tadallal'));
    expect(prompt).toContain('أنت "تدلل"، مساعد أردني');
    expect(prompt).toContain('باللهجة الأردنية بس');
    expect(buildComposePrompt(brandFor('tadallal'))).toContain('أنت "تدلل"، مساعد أردني');
  });

  it('never leaks the other variant’s name into a prompt', () => {
    expect(buildSystemPrompt(brandFor('rico'))).not.toContain('تدلل');
    expect(buildSystemPrompt(brandFor('tadallal'))).not.toContain('ريكو');
  });

  it('interpolates every hole in both prompts', () => {
    for (const slug of ['rico', 'tadallal']) {
      const prompt = buildSystemPrompt(brandFor(slug));
      expect(prompt).not.toContain('${');
      expect(buildComposePrompt(brandFor(slug))).not.toContain('${');
      // the category enum and MAX_INTENTS are interpolated, not literal text
      expect(prompt).toContain('restaurant, cafe, pharmacy');
      expect(prompt).toContain('بحد أقصى 3');
    }
  });

  it('seeds Whisper with the brand’s own high street', () => {
    expect(buildVocabHint(brandFor('rico'))).toContain('البيك');
    expect(buildVocabHint(brandFor('rico'))).not.toContain('مناصير');
    expect(buildVocabHint(brandFor('tadallal'))).toContain('مناصير');
    expect(buildVocabHint(brandFor('tadallal'))).not.toContain('البيك');
  });

  // Clients already installed send no brand field at all; they must keep
  // getting the original Saudi ريكو rather than being re-dialected.
  it('falls back to ريكو in Saudi for a missing or unknown slug', () => {
    for (const slug of [undefined, '', 'not-a-brand']) {
      expect(buildSystemPrompt(brandFor(slug))).toContain('أنت "ريكو"، مساعد سعودي');
      expect(buildVocabHint(brandFor(slug))).toContain('البيك');
    }
  });
});
