// A model response that survives JSON.parse but yields no usable intent used
// to become a 502. The client reads any error as "server down" and falls back
// to local keyword matching, which defaults every category-less message to
// "مطعم" — so an unintelligible question was answered with nearby restaurants.
// These lock in the clarification path that replaced it.
import { ClassifyService } from './classify.service';
import { LlmService } from '../llm/llm.service';

describe('classify: a message with no usable intent', () => {
  const serviceReplying = (content: string) =>
    new ClassifyService({ complete: async () => ({ content }) } as unknown as LlmService);

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

  it('still errors on output that is not JSON at all — that is a real failure', async () => {
    // Worth keeping distinct: the client retries/falls back locally for this,
    // which is right when the model is broken but wrong when it simply had
    // nothing to return.
    await expect(serviceReplying('sorry, I cannot').classify({ message: 'x' } as any)).rejects.toThrow();
  });
});
