// What the registry puts in the prompt is the whole payoff of the feature: an
// approved lesson has to reach the classifier in this process, in the right
// dialect, without pushing the rules out of the model's attention.
import { learnedExamplesBlock, lessonRegistry, MAX_PROMPT_CHARS } from './constants/lessons.registry';

const example = (over: Partial<Parameters<typeof lessonRegistry.replaceAll>[0][number]> = {}) => ({
  message: 'بدي أقعد مع صحابي على قهوة',
  dialect: 'any',
  intents: [{ kind: 'place', category: 'cafe' }] as Record<string, unknown>[],
  reply: null,
  ...over,
});

describe('learnedExamplesBlock', () => {
  afterEach(() => lessonRegistry.replaceAll([]));

  it('adds nothing until somebody approves a first lesson', () => {
    lessonRegistry.replaceAll([]);
    expect(learnedExamplesBlock('saudi')).toBe('');
  });

  it('puts an approved example, and its expected output, in the prompt', () => {
    lessonRegistry.replaceAll([example()]);
    const block = learnedExamplesBlock('saudi');

    expect(block).toContain('بدي أقعد مع صحابي على قهوة');
    expect(block).toContain('"category":"cafe"');
  });

  it('keeps a dialect-specific lesson out of the other dialect', () => {
    lessonRegistry.replaceAll([example({ message: 'بدي إشي يسد الجوع', dialect: 'jordanian' })]);

    expect(learnedExamplesBlock('jordanian')).toContain('بدي إشي يسد الجوع');
    expect(learnedExamplesBlock('saudi')).toBe('');
  });

  it('writes a reply-only lesson as an answer rather than a search', () => {
    lessonRegistry.replaceAll([example({ intents: [], reply: 'ما بوصّل، بس بدلّك على الأقرب' })]);
    expect(learnedExamplesBlock('any')).toContain('"offTopic":true');
  });

  it('folds a multi-line message onto one line', () => {
    // Two lines would read as two examples to the model.
    lessonRegistry.replaceAll([example({ message: 'بدي\nكهربجي' })]);
    const line = learnedExamplesBlock('saudi').split('\n').find((l) => l.startsWith('- '));
    expect(line).toContain('بدي كهربجي');
  });

  it('stops adding examples before the prompt budget is spent', () => {
    const long = 'س'.repeat(400);
    lessonRegistry.replaceAll(Array.from({ length: 30 }, (_, i) => example({ message: `${long}${i}` })));

    const block = learnedExamplesBlock('saudi');
    expect(block.length).toBeLessThan(MAX_PROMPT_CHARS + 1000);
  });

  it('rebuilds after an edit instead of serving the memoized block', () => {
    lessonRegistry.replaceAll([example({ message: 'الأول' })]);
    expect(learnedExamplesBlock('saudi')).toContain('الأول');

    lessonRegistry.replaceAll([example({ message: 'الثاني' })]);
    const block = learnedExamplesBlock('saudi');
    expect(block).toContain('الثاني');
    expect(block).not.toContain('الأول');
  });
});
