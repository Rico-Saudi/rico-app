// A model response that survives JSON.parse but yields no usable intent used
// to become a 502. The client reads any error as "server down" and falls back
// to local keyword matching, which defaults every category-less message to
// "مطعم" — so an unintelligible question was answered with nearby restaurants.
// These lock in the clarification path that replaced it.
import { ClassifyService } from './classify.service';
import { LlmService } from '../llm/llm.service';
import { LearningService } from '../learning/learning.service';

describe('classify: a message with no usable intent', () => {
  const serviceReplying = (content: string, learning: Partial<LearningService> = {}) =>
    new ClassifyService({ complete: async () => ({ content }) } as unknown as LlmService, {
      record: async () => {},
      ...learning,
    } as unknown as LearningService);

  it('asks for clarification instead of failing when every intent is invalid', async () => {
    // category "مطعم فخم" is not in CATEGORIES, so validateIntent drops it.
    const service = serviceReplying(
      JSON.stringify({ offTopic: false, reply: null, intents: [{ kind: 'place', category: 'مطعم فخم' }] }),
    );

    const result = await service.classify({ message: 'اسدجفه' } as any);

    expect(result.offTopic).toBe(true);
    expect(result.intents).toEqual([]);
    expect(result.reply).toBeTruthy();
  });

  it('answers an empty intent list the same way', async () => {
    const service = serviceReplying(JSON.stringify({ offTopic: false, reply: null, intents: [] }));
    expect((await service.classify({ message: '؟؟؟' } as any)).offTopic).toBe(true);
  });

  it("prefers the model's own wording when it wrote one", async () => {
    const service = serviceReplying(
      JSON.stringify({ offTopic: false, reply: 'وش تقصد بالضبط؟', intents: [{ kind: 'place', category: 'nope' }] }),
    );
    expect((await service.classify({ message: 'x' } as any)).reply).toBe('وش تقصد بالضبط؟');
  });

  it('clarifies in the asking brand dialect', async () => {
    const body = JSON.stringify({ offTopic: false, reply: null, intents: [] });
    const saudi = await serviceReplying(body).classify({ message: 'x', brand: 'rico' } as any);
    const jordanian = await serviceReplying(body).classify({ message: 'x', brand: 'tadallal' } as any);

    expect(saudi.reply).toContain('وش تبي');
    expect(jordanian.reply).toContain('شو بدك');
  });

  it('still returns valid intents untouched', async () => {
    const service = serviceReplying(
      JSON.stringify({ offTopic: false, reply: null, intents: [{ kind: 'place', category: 'pharmacy', rank: 'nearest' }] }),
    );

    const result = await service.classify({ message: 'أقرب صيدلية' } as any);
    expect(result.offTopic).toBe(false);
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]).toMatchObject({ kind: 'place', category: 'pharmacy' });
  });

  // ── what the owner dashboard is fed ──────────────────────────────────────

  it('records the question so it can be taught later', async () => {
    const recorded: any[] = [];
    const service = serviceReplying(JSON.stringify({ offTopic: false, reply: null, intents: [] }), {
      record: async (entry: any) => void recorded.push(entry),
    });

    await service.classify({ message: 'بدي حدا يصلّح لي البويلر', brand: 'tadallal' } as any);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ message: 'بدي حدا يصلّح لي البويلر', brand: 'tadallal', dialect: 'jordanian' });
    expect(recorded[0].ricoReply).toBeTruthy();
  });

  it('records nothing for a greeting, which is off-topic but understood', async () => {
    // offTopic covers three different things (see the prompt's offTopic
    // section): small talk, a vague mood, and "I didn't understand". Only
    // the last is a gap; logging the first two would bury the real ones
    // under greetings.
    const recorded: any[] = [];
    const service = serviceReplying(
      JSON.stringify({ offTopic: true, notUnderstood: false, reply: 'هلا والله', intents: [] }),
      { record: async (entry: any) => void recorded.push(entry) },
    );

    await service.classify({ message: 'هلا كيفك', brand: 'tadallal' } as any);
    expect(recorded).toEqual([]);
  });

  it('records the question when the model says it did not understand', async () => {
    // The common path, and the one that used to be missed: the prompt asks
    // the model to say "ما فهمتك" itself with offTopic=true, so these never
    // reach the empty-intents fallback below.
    const recorded: any[] = [];
    const service = serviceReplying(
      JSON.stringify({ offTopic: true, notUnderstood: true, reply: 'ما ضبطت معي هاي 😅', intents: [] }),
      { record: async (entry: any) => void recorded.push(entry) },
    );

    await service.classify({ message: 'بدي إشي للزلمة اللي بيجي ع البيت', brand: 'tadallal' } as any);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ message: 'بدي إشي للزلمة اللي بيجي ع البيت', dialect: 'jordanian' });
    expect(recorded[0].ricoReply).toBe('ما ضبطت معي هاي 😅');
  });

  it('treats a missing notUnderstood flag as "understood"', async () => {
    // An older model, or one that dropped the field, must not turn every
    // greeting into a training gap.
    const recorded: any[] = [];
    const service = serviceReplying(JSON.stringify({ offTopic: true, reply: 'أهلين', intents: [] }), {
      record: async (entry: any) => void recorded.push(entry),
    });

    await service.classify({ message: 'مرحبا', brand: 'tadallal' } as any);
    expect(recorded).toEqual([]);
  });

  it('answers the customer even when recording the gap fails', async () => {
    // The write is a side effect of someone waiting on a reply — a dead
    // Mongo must not turn a working answer into an error.
    const service = serviceReplying(JSON.stringify({ offTopic: false, reply: null, intents: [] }), {
      record: async () => {
        throw new Error('mongo is down');
      },
    });

    await expect(service.classify({ message: 'x' } as any)).resolves.toMatchObject({ offTopic: true });
  });

  it('still errors on output that is not JSON at all — that is a real failure', async () => {
    // Worth keeping distinct: the client retries/falls back locally for this,
    // which is right when the model is broken but wrong when it simply had
    // nothing to return.
    await expect(serviceReplying('sorry, I cannot').classify({ message: 'x' } as any)).rejects.toThrow();
  });
});
