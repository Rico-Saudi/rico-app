// The keyword fallback answers whenever Groq can't (a 429 on the free tier is
// the common case). Two things are locked in here: the cases that started
// this — "بدي قاعة افراح" answered with "ما فهمتك" — and the corpus the
// persona agents wrote (scripts/agent-corpus), held to a floor so a new
// keyword can't quietly break a hundred old ones.
import { join } from 'path';
import { HttpException, HttpStatus } from '@nestjs/common';
import { keywordClassify, keywordClassifyInContext } from './keyword-classifier';
import { grade, gradeOrder, loadCorpus } from './corpus-grading';
import { ClassifyService } from '../classify.service';
import { LlmService } from '../../llm/llm.service';
import { LearningService } from '../../learning/learning.service';

const learning = { record: async () => {} } as unknown as LearningService;

describe('keywordClassify', () => {
  it.each([
    ['احجزلي تذكره عمان دبي ع العربيه', 'travel_agency'],
    ['ابي سيارة ايجار شهري', 'car_rental'],
    ['وين اقدر استأجر سكوتر كهربائي', 'scooter_rental'],
    ['بدي استأجر كوستر لرحلة البحر الميت', 'bus_rental'],
    ['وين مكتب جت بقطع تذكرة للعقبة', 'bus_station'],
    ['بدي ابعت طرد لامي على اربد', 'courier'],
    ['مواقف المطار الطويله', 'parking'],
  ])('transport: %s', (msg, expected) => {
    const intents = keywordClassify(msg);
    expect(intents).toHaveLength(1);
    expect(intents[0].customTag?.value ?? intents[0].category).toBe(expected);
  });

  it('a ride is a driver, and where it goes is the trip, not a second search', () => {
    expect(keywordClassify('ابي احد يوصل عيالي المدرسة كل يوم')).toEqual([expect.objectContaining({ profession: 'driver' })]);
    expect(keywordClassify('بدي سواق يوصلني ع مطار الملكه علياء الساعه 3')).toEqual([expect.objectContaining({ profession: 'driver' })]);
  });

  it.each(['اوبر احسن ولا كريم؟', 'كم سعر تاجير الكامري باليوم عند يلو', 'بدي اشتغل مندوب مع طلبات شو بدي اعمل', 'وين وصلت شحنتي من ارامكس رقم التتبع معي'])(
    'transport chat stays chat: %s',
    (msg) => expect(keywordClassify(msg)).toEqual([]),
  );

  it.each(['بدي قاعة افراح', 'ابغى قاعه افراح', 'وين اقرب صالة مناسبات', 'قاعة اعراس رخيصة', 'wedding hall'])(
    'understands a wedding hall: %s',
    (msg) => {
      expect(keywordClassify(msg)).toEqual([
        expect.objectContaining({ kind: 'place', category: 'other', customTag: { key: 'amenity', value: 'wedding_hall' }, label: 'قاعة أفراح' }),
      ]);
    },
  );

  it('splits a multi-request message and keeps what each asks', () => {
    const intents = keywordClassify('بدي قاعة افراح ومصور وارخص محل ورد');
    expect(intents.map((i) => i.kind === 'professional' ? i.profession : i.category)).toEqual(['other', 'photographer', 'florist']);
    expect(intents[2].rank).toBe('cheapest');
  });

  it('reads a description as part of the request, not a second one', () => {
    expect(keywordClassify('ابي شاليه فيه مسبح بالبحر الميت')).toEqual([
      expect.objectContaining({ category: 'other', customTag: { key: 'tourism', value: 'chalet' } }),
    ]);
  });

  it('turns a described problem into the trade that fixes it', () => {
    expect(keywordClassify('الحمام مسدود والمويه راجعه')).toEqual([expect.objectContaining({ kind: 'professional', profession: 'drain_cleaning' })]);
    expect(keywordClassify('بدي ستلايتجي الدش مش ملقط')).toEqual([expect.objectContaining({ profession: 'satellite_technician' })]);
  });

  it('a shop that sells it is not a person who does it', () => {
    expect(keywordClassify('وين محل دهانات')).toEqual([expect.objectContaining({ kind: 'place', category: 'hardware_store' })]);
    expect(keywordClassify('ابي دهان يدهن الصاله')).toEqual([expect.objectContaining({ kind: 'professional', profession: 'painter' })]);
  });

  it('parses an order from a named shop (legacy cases)', () => {
    expect(keywordClassify('اطلب لي من البيك ٢ مسحب')).toEqual([
      expect.objectContaining({ kind: 'order', placeName: 'البيك', orderItems: [{ name: 'مسحب', quantity: 2 }] }),
    ]);
    expect(keywordClassify('اطلب لي من صيدلية النهدي بنادول')).toEqual([
      expect.objectContaining({ kind: 'order', placeName: 'صيدلية النهدي', orderItems: [{ name: 'بنادول', quantity: 1 }] }),
    ]);
  });

  it('an order from "the second one" points at the list Rico just showed', () => {
    expect(keywordClassify('بدي اطلب من الثاني ٣ شاورما')).toEqual([
      expect.objectContaining({ kind: 'order', referencedPosition: 2, orderItems: [{ name: 'شاورما', quantity: 3 }] }),
    ]);
  });

  it('drops what the customer turned down', () => {
    expect(keywordClassify('ما ابي مطعم، ابي كافيه هادي')).toEqual([expect.objectContaining({ category: 'cafe' })]);
  });

  it('corrects a one-letter typo only when nothing matched as written', () => {
    expect(keywordClassify('بدي اروح عالجوازت')).toEqual([expect.objectContaining({ category: 'government_office' })]);
    expect(keywordClassify('يعطيك العافيه')).toEqual([]);
  });

  it.each([
    'كيف اجدد الجواز',
    'شو احسن دوا للصداع',
    'هل البندول يتعارض مع المضاد الحيوي',
    'مرحبا',
    'شكرا',
    'يعطيك العافية تدلل',
    'تقدر تحجز لي موعد بالاحوال؟',
    'اخوي سباك وشغله نظيف',
    'امبارح اكلت بمطعم وكان زفت',
    'ما بدي مطعم، بس بدي احكي معك',
    'صباح الخير يا احلى كافيه',
    'كيف تختار لي اقرب صيدلية؟',
  ])('leaves chat to the app: %s', (msg) => {
    expect(keywordClassify(msg)).toEqual([]);
  });
});

describe('keywordClassify against the agent corpus', () => {
  const corpus = loadCorpus(join(__dirname, '../../../scripts/agent-corpus'));

  it('has a corpus to run', () => {
    expect(corpus.length).toBeGreaterThan(2800);
  });

  // The floor sits a little under today's score (~90% over 1,900 lines from
  // five rounds of agents, two of them written to break it) so a change that
  // costs a few dozen lines fails here.
  it('answers at least 88% of it exactly, and never searches on chat', () => {
    const grades = corpus.map((line) => ({
      line,
      g: grade(line.expect, keywordClassifyInContext(line.msg, { history: line.history ?? [], lastResults: line.lastResults ?? null })),
    }));
    const pass = grades.filter((x) => x.g === 'pass').length / grades.length;
    const falsePositives = grades.filter((x) => x.g === 'false_positive').map((x) => x.line.msg);

    expect(falsePositives).toEqual([]);
    expect(pass).toBeGreaterThanOrEqual(0.88);
  });
});

describe('orders against the agent corpus', () => {
  const orders = loadCorpus(join(__dirname, '../../../scripts/agent-corpus')).filter((l) => l.order && l.expect.includes('order'));

  // ~92% today over ~570 orders (single messages and conversations) from
  // seven agents; the floor leaves room for a few lines, not a habit.
  it('gets the shop and the whole basket right for at least 88% of them', () => {
    expect(orders.length).toBeGreaterThan(500);
    const right = orders.filter((l) => {
      const g = gradeOrder(l.order!, keywordClassifyInContext(l.msg, { history: l.history ?? [], lastResults: l.lastResults ?? null }));
      return g.shop && g.items;
    }).length;
    expect(right / orders.length).toBeGreaterThanOrEqual(0.88);
  });

  it.each([
    ['اطلب لي من البيك ٣ مسحب حار و٢ بيبسي', 'البيك', [['مسحب حار', 3], ['بيبسي', 2]]],
    ['جيبلي من جبري كنافتين ناعمة', 'جبري', [['كنافة ناعمة', 2]]],
    ['ابي من حلويات سعد الدين كيلو بسبوسة ونص كيلو معمول', 'حلويات سعد الدين', [['كيلو بسبوسة', 1], ['نص كيلو معمول', 1]]],
    ['٢ كابتشينو من ستاربكس', 'ستاربكس', [['كابتشينو', 2]]],
    ['مرحبا، من غاز العتيبي جرة غاز وحدة', 'غاز العتيبي', [['جرة غاز', 1]]],
    ['ريكو ابي اطلب من ماكدونالدز بيق ماك اثنين لا لا ثلاثة وماك فلوري', 'ماكدونالدز', [['بيق ماك', 3], ['ماك فلوري', 1]]],
  ])('basket: %s', (msg, shop, items) => {
    const order = keywordClassify(msg as string).find((i) => i.kind === 'order');
    expect(order?.placeName).toBe(shop);
    expect(order?.orderItems?.map((i) => [i.name, i.quantity])).toEqual(items);
  });

  it.each(['وصلني من مطعم', 'وين اطلب منسف؟', 'الغي طلبي من كودو', 'طلبي من البيك تأخر ساعة', 'شو بتنصحني اطلب من البيك؟', 'بقاله قريبه ابي حليب وخبز'])(
    'not an order: %s',
    (msg) => expect(keywordClassify(msg).some((i) => i.kind === 'order')).toBe(false),
  );
});

describe('follow-ups in a conversation', () => {
  const list = (label: string, names: string[]) => ({ label, items: names.map((name, i) => ({ position: i + 1, name })) });
  const turn = (user: string, assistant: string) => [
    { role: 'user', content: user },
    { role: 'assistant', content: assistant },
  ];

  it('refines the search before', () => {
    const ctx = { history: turn('ابي مطعم مندي قريب', 'لقيتلك ٤ مطاعم 👇'), lastResults: list('مطعم', ['مطعم نجد', 'البيك', 'ريم', 'هرفي']) };
    expect(keywordClassifyInContext('فيه ارخص؟', ctx)).toEqual([expect.objectContaining({ category: 'restaurant', rank: 'cheapest' })]);
    expect(keywordClassifyInContext('بس اللي فاتح هلأ', ctx)).toEqual([expect.objectContaining({ category: 'restaurant', rank: 'open_now' })]);
    expect(keywordClassifyInContext('مين الأعلى تقييم؟', ctx)).toEqual([expect.objectContaining({ category: 'restaurant', rank: 'best_rated' })]);
  });

  it('points at the list', () => {
    const ctx = { history: turn('صيدلية قريبة', 'لقيتلك ٣ صيدليات 👇'), lastResults: list('صيدلية', ['النهدي', 'الدواء', 'الشفاء']) };
    expect(keywordClassifyInContext('التاني', ctx)).toEqual([expect.objectContaining({ category: 'pharmacy', referencedPosition: 2 })]);
    expect(keywordClassifyInContext('الاخير', ctx)).toEqual([expect.objectContaining({ referencedPosition: 3 })]);
  });

  // The app opens a fresh basket for every order intent, so a follow-up
  // answers with the whole basket as it should now be.
  it('adds to an order already started, keeping what was in it', () => {
    const ctx = { history: turn('اطلبلي من هاشم فول', 'ضفت فول 👍 بدك اشي كمان؟'), lastResults: null };
    expect(keywordClassifyInContext('وزيد ٢ فلافل', ctx)).toEqual([
      expect.objectContaining({ kind: 'order', placeName: 'هاشم', orderItems: [{ name: 'فول', quantity: 1 }, { name: 'فلافل', quantity: 2 }] }),
    ]);
  });

  it.each([
    ['شيل البيبسي', [['شاورما عربي', 3]]],
    ['بدل البيبسي خليها سفن اب', [['شاورما عربي', 3], ['سفن اب', 1]]],
    ['خلي الكل اتنين', [['شاورما عربي', 2], ['بيبسي', 2]]],
  ])('edits the basket: %s', (msg, items) => {
    const ctx = { history: turn('بدي اطلب من شاورما ريم ٣ شاورما عربي وبيبسي', 'تمام، سلتك جاهزة 👍'), lastResults: null };
    const order = keywordClassifyInContext(msg as string, ctx).find((i) => i.kind === 'order');
    expect(order?.placeName).toBe('شاورما ريم');
    expect(order?.orderItems?.map((i) => [i.name, i.quantity])).toEqual(items);
  });

  it('moves the basket to another shop', () => {
    const ctx = { history: turn('ابي من البيك ٢ برجر دجاج وبطاطس', 'تمام 👍'), lastResults: null };
    expect(keywordClassifyInContext('لا خلها من هرفي بدل البيك', ctx)).toEqual([expect.objectContaining({ placeName: 'هرفي' })]);
  });

  it.each(['هل التاني بقبل فيزا؟', 'كم سعر الليلة بالأول؟', 'خلص بلاش، رح اكل بالبيت', 'شكرا'])('chat about the list: %s', (msg) => {
    const ctx = { history: turn('بدي مطعم', 'لقيتلك ٣ مطاعم 👇'), lastResults: list('مطعم', ['أ', 'ب', 'ج']) };
    expect(keywordClassifyInContext(msg, ctx)).toEqual([]);
  });

  it('orders from the item picked a turn ago', () => {
    const ctx = {
      history: [...turn('ملحمة قريبة', 'لقيتلك ٣ ملاحم 👇'), ...turn('الأولى', 'ملحمة الخير، تبي تطلب منها؟')],
      lastResults: list('ملحمة', ['ملحمة الخير', 'ملحمة الأمانة', 'ملحمة النعيمي']),
    };
    expect(keywordClassifyInContext('ايه ابي منها ٢ كيلو لحم غنم', ctx)).toEqual([
      expect.objectContaining({ kind: 'order', referencedPosition: 1, orderItems: [{ name: 'كيلو لحم غنم', quantity: 2 }] }),
    ]);
  });

  it('a new request is read on its own', () => {
    const ctx = { history: turn('ابي مطعم', 'لقيتلك ٥ مطاعم 👇'), lastResults: list('مطعم', ['أ', 'ب', 'ج']) };
    expect(keywordClassifyInContext('طيب بدي صيدلية كمان', ctx)).toEqual([expect.objectContaining({ category: 'pharmacy' })]);
    expect(keywordClassifyInContext('لا قصدي كافيه مو مطعم', ctx)).toEqual([expect.objectContaining({ category: 'cafe' })]);
  });
});

describe('ClassifyService when the model is unavailable', () => {
  const failing = (status: number) =>
    new ClassifyService(
      {
        complete: async () => {
          throw new HttpException({ error: 'upstream_error', status }, HttpStatus.BAD_GATEWAY);
        },
      } as unknown as LlmService,
      learning,
    );

  it('answers from the keyword table on a 429', async () => {
    const result = await failing(429).classify({ message: 'بدي قاعة افراح', brand: 'tadallal' } as any);
    expect(result.offTopic).toBe(false);
    expect(result.intents[0]).toMatchObject({ kind: 'place', category: 'other', label: 'قاعة أفراح' });
  });

  it('still fails when the table does not understand either, so the app replies itself', async () => {
    await expect(failing(429).classify({ message: 'هلا والله', brand: 'rico' } as any)).rejects.toBeInstanceOf(HttpException);
  });

  it('answers from the table when the model said it did not understand', async () => {
    const service = new ClassifyService(
      { complete: async () => ({ content: JSON.stringify({ offTopic: true, notUnderstood: true, reply: 'ما فهمتك', intents: [] }) }) } as unknown as LlmService,
      learning,
    );
    const result = await service.classify({ message: 'وين في بنشر قريب', brand: 'tadallal' } as any);
    expect(result.offTopic).toBe(false);
    expect(result.intents[0]).toMatchObject({ customTag: { value: 'tire_shop' } });
  });

  it('searches instead when the model answered with a refusal', async () => {
    const recorded: string[] = [];
    const service = new ClassifyService(
      {
        complete: async () => ({ content: JSON.stringify({ offTopic: true, reply: 'آسف، ما بقدر احجز طيران، بس بقدر أساعدك تلاقي مطعم', intents: [] }) }),
      } as unknown as LlmService,
      { record: async (g: { message: string }) => void recorded.push(g.message) } as unknown as LearningService,
    );
    const result = await service.classify({ message: 'احجزلي طيران للقاهرة', brand: 'tadallal' } as any);
    expect(result.offTopic).toBe(false);
    expect(result.intents[0]).toMatchObject({ kind: 'place', category: 'travel_agency' });
    expect(recorded).toEqual(['احجزلي طيران للقاهرة']);
  });

  it('keeps the model answer when the model understood', async () => {
    const service = new ClassifyService(
      { complete: async () => ({ content: JSON.stringify({ offTopic: true, reply: 'هلا فيك! وش تبي اطلب لك؟', intents: [] }) }) } as unknown as LlmService,
      learning,
    );
    const result = await service.classify({ message: 'اخوي سباك', brand: 'rico' } as any);
    expect(result.offTopic).toBe(true);
  });
});
