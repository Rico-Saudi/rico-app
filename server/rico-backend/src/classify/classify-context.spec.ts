// What the classifier is shown of the conversation, and what it does with a
// position or a taught answer. Each case here was a live failure: the app's
// history already ends with the message being classified, a merged answer
// lists more than ten places, and an owner's written answer came back
// paraphrased (or not at all while Groq was down).
import { ClassifyService, trimContext } from './classify.service';
import { LlmService } from '../llm/llm.service';
import { LearningService } from '../learning/learning.service';
import { lessonRegistry } from '../learning/constants/lessons.registry';

type Call = { messages: { role: string; content: string }[] };

const serviceWith = (complete: (req: Call) => Promise<{ content: string }>) =>
  new ClassifyService({ complete } as unknown as LlmService, { record: async () => {} } as unknown as LearningService);

const down = () =>
  serviceWith(async () => {
    throw new Error('upstream_unreachable');
  });

describe('trimContext', () => {
  it('drops the copy of the current message the app leaves at the end of history', () => {
    const { history } = trimContext({
      message: 'من البيك',
      history: [
        { role: 'user', content: 'ابي اطلب عشا' },
        { role: 'assistant', content: 'من وين؟' },
        { role: 'user', content: 'من البيك' },
      ],
    } as any);
    expect(history.map((h) => h.content)).toEqual(['ابي اطلب عشا', 'من وين؟']);
  });

  it('keeps an earlier identical message — only the trailing copy is the duplicate', () => {
    const { history } = trimContext({
      message: 'الثاني',
      history: [
        { role: 'user', content: 'الثاني' },
        { role: 'assistant', content: 'هذا هو' },
      ],
    } as any);
    expect(history).toHaveLength(2);
  });

  it('shortens long turns instead of rejecting the request', () => {
    const { message, history } = trimContext({
      message: 'ب'.repeat(1500),
      history: [{ role: 'assistant', content: 'أ'.repeat(2000) }],
    } as any);
    expect(message.length).toBe(600);
    expect(history[0].content.length).toBe(300);
  });
});

describe('the model sees each message once', () => {
  it('sends the current message only as the final user turn', async () => {
    let seen: Call | null = null;
    const service = serviceWith(async (req) => {
      seen = req;
      return { content: JSON.stringify({ offTopic: false, intents: [{ kind: 'place', category: 'restaurant' }] }) };
    });
    await service.classify({
      message: 'أقرب مطعم',
      history: [{ role: 'user', content: 'أقرب مطعم' }],
    } as any);
    const userTurns = seen!.messages.filter((m) => m.role === 'user').map((m) => m.content);
    expect(userTurns).toEqual(['أقرب مطعم']);
  });
});

describe('keyword fallback with the history the app really sends', () => {
  it('reads «من البيك» after «من وين؟» as an order, not a search', async () => {
    const result: any = await down().classify({
      message: 'من البيك',
      history: [
        { role: 'user', content: 'ابي اطلب عشا' },
        { role: 'assistant', content: 'من وين؟' },
        { role: 'user', content: 'من البيك' },
      ],
    } as any);
    expect(result.intents[0]).toMatchObject({ kind: 'order' });
  });
});

describe('positions on the last list', () => {
  const replying = (intent: Record<string, unknown>) =>
    serviceWith(async () => ({ content: JSON.stringify({ offTopic: false, intents: [intent] }) }));
  const twoShown = {
    label: 'مطاعم',
    items: [
      { position: 1, name: 'مطعم أ' },
      { position: 2, name: 'مطعم ب' },
    ],
  };

  it('keeps a position that is on the list', async () => {
    const result: any = await replying({ kind: 'place', category: 'restaurant', referencedPosition: 2 }).classify({
      message: 'الثاني',
      lastResults: twoShown,
    } as any);
    expect(result.intents[0].referencedPosition).toBe(2);
  });

  it('drops a position past the end of the list', async () => {
    const result: any = await replying({ kind: 'place', category: 'restaurant', referencedPosition: 5 }).classify({
      message: 'الخامس',
      lastResults: twoShown,
    } as any);
    expect(result.intents[0]).toMatchObject({ kind: 'place', referencedPosition: null });
  });

  it('drops an order that only pointed at a position that was never shown', async () => {
    const result: any = await replying({ kind: 'order', referencedPosition: 3, orderItems: [] }).classify({
      message: 'اطلب من الثالث',
      lastResults: twoShown,
    } as any);
    expect(result.intents.find((i: any) => i.kind === 'order')).toBeUndefined();
  });

  it('accepts a list longer than ten places', async () => {
    const items = Array.from({ length: 16 }, (_, i) => ({ position: i + 1, name: `محل ${i + 1}` }));
    const result: any = await replying({ kind: 'place', category: 'cafe', referencedPosition: 14 }).classify({
      message: 'الرابع عشر',
      lastResults: { label: '', items },
    } as any);
    expect(result.intents[0].referencedPosition).toBe(14);
  });
});

describe('an answer the owner taught', () => {
  afterEach(() => lessonRegistry.replaceAll([]));

  it('is served as written, without asking the model', async () => {
    lessonRegistry.replaceAll([
      { message: 'هل توصلون للبيت؟', dialect: 'any', intents: [], reply: 'ريكو ما يوصّل بنفسه، بس المحلات توصّل — قل لي وش تبي.' },
    ]);
    let called = false;
    const service = serviceWith(async () => {
      called = true;
      return { content: '{}' };
    });
    // Spelling folded: no hamza, ى/ي, extra punctuation.
    const result: any = await service.classify({ message: 'هل توصلون للبيت؟؟' } as any);
    expect(called).toBe(false);
    expect(result).toMatchObject({ offTopic: true, reply: 'ريكو ما يوصّل بنفسه، بس المحلات توصّل — قل لي وش تبي.' });
  });

  it('works while the model is down', async () => {
    lessonRegistry.replaceAll([
      { message: 'وين اتعشى', dialect: 'any', intents: [{ kind: 'place', category: 'restaurant', rank: 'nearest' }], reply: null },
    ]);
    const result: any = await down().classify({ message: 'وين أتعشى' } as any);
    expect(result.intents[0]).toMatchObject({ kind: 'place', category: 'restaurant' });
  });

  it('keeps to its dialect', async () => {
    lessonRegistry.replaceAll([{ message: 'شو في', dialect: 'jordanian', intents: [], reply: 'أهلين! شو بدك؟' }]);
    let called = false;
    const service = serviceWith(async () => {
      called = true;
      return { content: JSON.stringify({ offTopic: true, reply: 'هلا', intents: [] }) };
    });
    await service.classify({ message: 'شو في', brand: 'rico' } as any);
    expect(called).toBe(true);
  });
});

describe('the basket the app holds', () => {
  const basket = {
    placeName: 'البيك',
    items: [
      { name: 'شاورما', quantity: 2 },
      { name: 'بيبسي', quantity: 1 },
    ],
  };

  it('is shown to the model', async () => {
    let system = '';
    const service = serviceWith(async (req) => {
      system = req.messages[0].content;
      return { content: JSON.stringify({ offTopic: true, reply: 'تمام', intents: [] }) };
    });
    await service.classify({ message: 'شيل البيبسي', basket } as any);
    expect(system).toContain('سلة مفتوحة');
    expect(system).toContain('2 × شاورما');
  });

  it('is what the keyword table edits when the model is down, with no chat history at all', async () => {
    const result: any = await down().classify({ message: 'شيل البيبسي', basket } as any);
    expect(result.intents[0]).toMatchObject({ kind: 'order', placeName: 'البيك', orderItems: [{ name: 'شاورما', quantity: 2 }] });
  });
});

describe('repeated standalone messages', () => {
  const counting = () => {
    let calls = 0;
    const service = serviceWith(async () => {
      calls++;
      return { content: JSON.stringify({ offTopic: false, intents: [{ kind: 'place', category: 'restaurant' }] }) };
    });
    return { service, calls: () => calls };
  };

  it('ask the model once, spelling variants included', async () => {
    const { service, calls } = counting();
    await service.classify({ message: 'أقرب مطعم' } as any);
    const again: any = await service.classify({ message: 'اقرب مطعم!' } as any);
    expect(calls()).toBe(1);
    expect(again.intents[0].category).toBe('restaurant');
  });

  it('still ask the model when the conversation could change the meaning', async () => {
    const { service, calls } = counting();
    await service.classify({ message: 'أقرب مطعم' } as any);
    await service.classify({ message: 'أقرب مطعم', history: [{ role: 'assistant', content: 'هلا' }] } as any);
    expect(calls()).toBe(2);
  });

  it('are not shared between dialects', async () => {
    const { service, calls } = counting();
    await service.classify({ message: 'سمكري', brand: 'rico' } as any);
    await service.classify({ message: 'سمكري', brand: 'tadallal' } as any);
    expect(calls()).toBe(2);
  });
});
