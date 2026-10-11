// "بدي موت؟" used to reach a person in distress as «ما فهمتك»: the model
// understood it fine, but it only got the message when Groq's per-minute
// token cap allowed, and the client's keyword fallback only knew the spelling
// with the alif. The safety reply now comes from here, before any model call,
// for every spelling and dialect.
import { ClassifyService } from './classify.service';
import { LlmService } from '../llm/llm.service';
import { LearningService } from '../learning/learning.service';
import { isDistress } from './constants/distress';

describe('classify: severe distress is answered before the model is asked', () => {
  const llmCalls: string[] = [];
  const gaps: string[] = [];
  const service = new ClassifyService(
    {
      complete: async ({ messages }: any) => {
        llmCalls.push(messages[messages.length - 1].content);
        return { content: JSON.stringify({ offTopic: false, intents: [{ kind: 'place', category: 'restaurant' }] }) };
      },
    } as unknown as LlmService,
    { record: async ({ message }: any) => void gaps.push(message) } as unknown as LearningService,
  );

  beforeEach(() => {
    llmCalls.length = 0;
    gaps.length = 0;
  });

  it.each(['بدي موت؟', 'بدي موت', 'بدي أموت', 'بدي اموت!!', 'ابي موت', 'ودي أموت', 'بدي أمووت', 'تعبت من حياتى', 'مليت من الحياة', 'ما بدي اعيش', 'بدي انتحر'])(
    'answers "%s" with care, without calling the model or logging a gap',
    async (message) => {
      const result = await service.classify({ message, brand: 'tadallal' } as any);

      expect(result.offTopic).toBe(true);
      expect(result.intents).toEqual([]);
      expect(result.reply).toContain('دكتور');
      expect(llmCalls).toEqual([]);
      expect(gaps).toEqual([]);
    },
  );

  it('answers in the brand dialect', async () => {
    expect((await service.classify({ message: 'بدي أموت', brand: 'tadallal' } as any)).reply).toContain('احكي');
    expect((await service.classify({ message: 'أبي أموت', brand: 'rico' } as any)).reply).toContain('تكلّم');
  });

  it.each(['بدي موت من الجوع', 'أبي أموت من الضحك', 'بدي موتور', 'أبي موتر', 'أقرب مطعم'])(
    'leaves "%s" to the model: hyperbole and look-alike words are not distress',
    async (message) => {
      expect(isDistress(message)).toBe(false);
      await service.classify({ message, brand: 'rico' } as any);
      expect(llmCalls).toEqual([message]);
    },
  );
});
