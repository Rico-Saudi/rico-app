// A training run's output is untrusted model text, and approving one of its
// proposals edits the prompt every customer is answered through. This is the
// gate between those two facts.
import { validateProposal } from './constants/proposal-validation';

const base = { gaps: [0], note: 'سبب' };

describe('validateProposal: examples', () => {
  it('keeps an example whose intents survive the classifier rules', () => {
    const lesson = validateProposal(
      {
        ...base,
        kind: 'example',
        message: 'بدي أقعد مع صحابي على قهوة',
        intents: [{ kind: 'place', category: 'cafe', rank: 'nearest' }],
      },
      ['بدي أقعد مع صحابي على قهوة'],
    );

    expect(lesson?.kind).toBe('example');
    expect(lesson?.intents).toHaveLength(1);
    expect(lesson?.reply).toBeNull();
  });

  it('drops an example built on an invented category', () => {
    // The same drop validateIntent does at answer time — an approved lesson
    // must never promise a shape the server throws away.
    expect(
      validateProposal({ ...base, kind: 'example', message: 'x', intents: [{ kind: 'place', category: 'مطعم فخم' }] }),
    ).toBeNull();
  });

  it('drops an example with neither a search nor an answer', () => {
    expect(validateProposal({ ...base, kind: 'example', message: 'x', intents: [], reply: '' })).toBeNull();
  });

  it('keeps a reply-only example for a question that should be answered, not searched', () => {
    const lesson = validateProposal(
      {
        ...base,
        kind: 'example',
        message: 'بتوصلوا للبيت؟',
        intents: [],
        reply: 'ما بوصّل، بس بدلّك على الأقرب إلك 👌',
      },
      ['بتوصلوا للبيت؟'],
    );

    expect(lesson?.intents).toEqual([]);
    expect(lesson?.reply).toContain('بدلّك');
  });

  it('drops an example with no message to learn from', () => {
    expect(validateProposal({ ...base, kind: 'example', intents: [{ kind: 'deals' }] })).toBeNull();
  });

  // Caught on the first live run: the model answered `"message": "example"`,
  // copying the word out of the prompt's JSON template. That string is what
  // would have been planted in the classifier prompt.
  it('replaces an invented message with the question the lesson claims to answer', () => {
    const lesson = validateProposal(
      { ...base, kind: 'example', message: 'example', intents: [{ kind: 'place', category: 'fuel' }] },
      ['وين ألاقي محل يعبّي غاز'],
    );

    expect(lesson?.message).toBe('وين ألاقي محل يعبّي غاز');
  });

  it('keeps the model wording when it echoed a real question', () => {
    const lesson = validateProposal(
      { ...base, kind: 'example', message: 'وين ألاقي محل يعبّي غاز', intents: [{ kind: 'place', category: 'fuel' }] },
      ['وين ألاقي محل يعبّي غاز', 'أبغى أعبي غاز'],
    );

    expect(lesson?.message).toBe('وين ألاقي محل يعبّي غاز');
  });

  it('drops an example that points at no real question at all', () => {
    expect(
      validateProposal({ ...base, kind: 'example', message: 'example', intents: [{ kind: 'deals' }] }, []),
    ).toBeNull();
  });
});

describe('validateProposal: professions', () => {
  const profession = (over: Record<string, unknown>) =>
    validateProposal({ ...base, kind: 'profession', profession: { group: 'maintenance', ...over } as any });

  it('drops a trade the registry already knows', () => {
    // Proposing an existing trade wastes a review and then fails at
    // approval, which is the worst of both.
    expect(profession({ slug: 'painter', label: 'دهّان' })).toBeNull();
  });

  it('drops a slug that is not a slug', () => {
    expect(profession({ slug: 'بويلرجي', label: 'فني بويلرات' })).toBeNull();
    expect(profession({ slug: 'Boiler Tech', label: 'فني بويلرات' })).toBeNull();
  });

  it('drops a group that does not exist', () => {
    expect(
      validateProposal({
        ...base,
        kind: 'profession',
        profession: { slug: 'boiler_technician', label: 'فني بويلرات', group: 'not_a_group' } as any,
      }),
    ).toBeNull();
  });

  it('keeps a new trade in a real group, with its aliases cleaned', () => {
    const lesson = validateProposal({
      ...base,
      kind: 'profession',
      profession: { slug: 'boiler_technician', label: 'فني بويلرات', group: 'maintenance', aliases: ['بويلر', '  ', 'سخان مركزي'] } as any,
    });

    expect(lesson?.kind).toBe('profession');
    expect((lesson?.profession as any).aliases).toEqual(['بويلر', 'سخان مركزي']);
  });
});

describe('validateProposal: everything else', () => {
  it('keeps a skip, which is how a run says "this is not ours to answer"', () => {
    const lesson = validateProposal({ ...base, kind: 'skip', message: 'كم نتيجة مباراة الهلال', note: 'رياضة' });
    expect(lesson?.kind).toBe('skip');
  });

  it('drops a kind nobody defined', () => {
    expect(validateProposal({ ...base, kind: 'fine_tune' as any, message: 'x' })).toBeNull();
  });

  it('falls back to a dialect-neutral lesson rather than an invented dialect', () => {
    const lesson = validateProposal({ ...base, kind: 'skip', message: 'x', dialect: 'egyptian' });
    expect(lesson?.dialect).toBe('any');
  });
});
