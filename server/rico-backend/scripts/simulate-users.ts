/**
 * وكلاء يلعبون دور زبائن حقيقيين، يسألون ريكو، ويعلّمونه من اللي ما عرفه.
 *
 * Real customers only reach the learning queue with the questions they happen
 * to ask, and only after Rico has already failed them. This puts personas in
 * front of Rico first — a student on a budget, a mother ordering for the
 * house, an elderly man who has never used an app, someone typing Franco,
 * someone asking about football — and sends whatever Rico gets wrong to the
 * same queue real failures go to.
 *
 * One round, per persona:
 *   1. the persona writes the messages it would send (one model call);
 *   2. each goes through the *production* ClassifyService, prompt and
 *      validation included — so a pass here is a pass in the app;
 *   3. the persona answers Rico where a real person would carry on, and
 *      that follow-up is classified with the conversation as history;
 *   4. a judge grades every exchange: understood, misunderstood, or answered
 *      without steering the customer toward an order.
 * Then a training run reads the queue and proposes lessons. Proposals wait
 * for the owner in the dashboard (تعلّم ريكو) like any other — an agent's
 * invented question doesn't get to change what every customer hears.
 *
 *   MONGODB_URI=... GROQ_API_KEY=... npx ts-node -r tsconfig-paths/register scripts/simulate-users.ts
 *
 * Flags:
 *   --personas=sa_student,jo_teen   only these (default: all)
 *   --per-persona=6                 opening messages per persona
 *   --dry-run                       grade only: write nothing, train nothing
 *   --no-train                      record gaps, skip the training run
 *   --delay=8000                    ms between model calls (Groq's free tier
 *                                   allows roughly one classify call per 8s)
 *   --out=report.json               write every exchange and verdict here
 */
import 'reflect-metadata';
import { writeFileSync } from 'fs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DatabaseModule } from '../src/database/database.module';
import { LlmModule } from '../src/llm/llm.module';
import { LlmService } from '../src/llm/llm.service';
import { LearningModule } from '../src/learning/learning.module';
import { GapRecord, LearningService } from '../src/learning/learning.service';
import { TrainingService } from '../src/learning/training.service';
import { Lesson } from '../src/learning/schemas/lesson.schema';
import { ClassifyService } from '../src/classify/classify.service';
import { brandFor } from '../src/common/constants/brands';

// ─── Who plays the customers ───────────────────────────────────────────────

export interface Persona {
  id: string;
  /** 'rico' answers in Saudi, 'tadallal' in Jordanian — see brands.ts. */
  brand: 'rico' | 'tadallal';
  /** Who they are and how they type. The persona model reads this verbatim. */
  profile: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'sa_student',
    brand: 'rico',
    profile: 'طالب جامعي سعودي بالرياض، ميزانيته محدودة، يكتب بسرعة بلا همزات ولا علامات ترقيم، يحب الوجبات السريعة ويدوّر على العروض والأرخص، ويطلب لنفسه ولشلته.',
  },
  {
    id: 'sa_mom',
    brand: 'rico',
    profile: 'أم سعودية بجدة عندها ثلاث عيال، تطلب أغراض البيت من البقالة والصيدلية، ورسائلها طويلة فيها كذا طلب مرة وحدة وكميات ("٢ حليب و كرتون موية").',
  },
  {
    id: 'sa_elder',
    brand: 'rico',
    profile: 'رجل سعودي كبير بالسن ما يعرف التطبيقات، يكتب بفصحى مكسورة ومؤدبة ("السلام عليكم يا ولدي")، يسأل كيف يطلب وكيف يدفع ومين يوصّل، ويخلط بين ريكو وموظف خدمة عملاء.',
  },
  {
    id: 'sa_franco',
    brand: 'rico',
    profile: 'شاب سعودي يكتب بالفرانكو (عربي بحروف إنجليزية وأرقام: "abgha burger 2 7ar") أو يخلط عربي وإنجليزي، أخطاؤه الإملائية كثيرة، ويسمّي ماركات (McDonald\'s, Starbucks, Herfy).',
  },
  {
    id: 'sa_angry',
    brand: 'rico',
    profile: 'زبون سعودي معصّب: طلبه تأخر أو المحل ما رد عليه أو جاه صنف غلط، يشتكي ويطلب استرجاع فلوس ويهدد يحذف التطبيق — بس بالآخر جوعان ويبي ياكل.',
  },
  {
    id: 'sa_curious',
    brand: 'rico',
    profile: 'شخص فضولي يختبر ريكو بأسئلة برّا شغله: نتيجة مباراة الهلال، نكتة، وقت الصلاة، ترجمة كلمة، سعر الذهب، مين صنعك، تحبني؟ — ويرجع أحياناً لطلب أكل عادي.',
  },
  {
    id: 'jo_office',
    brand: 'tadallal',
    profile: 'موظف أردني بشركة بعمّان، بطلب فطور وقهوة للمكتب، طلبات جماعية بكميات ("١٠ سندويشات فلافل و٥ شاي")، وبسأل عن أقرب مطعم بفتح بكير.',
  },
  {
    id: 'jo_home',
    brand: 'tadallal',
    profile: 'صاحب بيت أردني عنده أعطال: تسريب مي، بويلر خربان، دش ستلايت، مكيف، قفل باب — بيستعمل أسماء الحرف المحلية (بويلرجي، تمديدات، ستلايتجي، أبو الكهربا) وأحياناً بوصف المشكلة بدل المهنة.',
  },
  {
    id: 'jo_teen',
    brand: 'tadallal',
    profile: 'مراهق أردني طفشان، بدردش مع تدلل، بمزح وبحاول يحرجه أو يكسره، بحكي عن مشاعره (زهقان، مبسوط، معصّب من أهله)، وبطلب أشياء غريبة (شيبس حار، ألعاب، بلايستيشن).',
  },
  {
    id: 'jo_visitor',
    brand: 'tadallal',
    profile: 'زائر عربي من مصر أو الخليج بعمّان لأول مرة، بلهجته هو مش الأردنية ("عايز"، "أبغى")، بسأل عن أماكن سياحية، صرّاف، شريحة اتصال، أكل أردني مشهور (منسف، كنافة)، ومواصلات.',
  },
  {
    id: 'jo_health',
    brand: 'tadallal',
    profile: 'أم أردنية ابنها حرارته طالعة بالليل، مستعجلة وقلقانة، بتسأل عن صيدلية مناوبة، دوا خافض حرارة، دكتور أطفال، وبدها تطلب أغراض من الصيدلية.',
  },
  {
    id: 'jo_party',
    brand: 'tadallal',
    profile: 'شاب أردني بجهّز لحفلة تخرج أخته: بدو كيك، ورد، بالونات، مصوّر، كراسي، وأكل لعشرين شخص (مناسف أو مشاوي) — رسائله مليانة طلبات.',
  },
];

// ─── What the agents are asked ─────────────────────────────────────────────

function openersPrompt(persona: Persona, count: number): string {
  const brand = brandFor(persona.brand);
  return `أنت تمثّل دور زبون حقيقي يستخدم تطبيق "${brand.name}" — مساعد بالشات يدلّ على أقرب الأماكن والعروض وأصحاب المهن، وياخذ الطلبات من المحلات.

الشخصية: ${persona.profile}

اكتب ${count} رسائل مختلفة كان هذا الشخص فعلاً بيكتبها لـ${brand.name}، بأسلوبه هو بالضبط (أخطاؤه، طول رسائله). اللهجة ${brand.dialect === 'jordanian' ? 'أردنية' : 'سعودية'} — إلا إذا الشخصية نفسها من بلد ثاني أو تكتب بالفرانكو. نوّعها:
- أغلبها طلبات حقيقية: يطلب أكل أو أغراض من محل (باسم المحل أو بنوعه)، أو يدوّر على مكان، أو صاحب مهنة، أو عروض.
- وحدة على الأقل سؤال عن ${brand.name} نفسه أو عن الخدمة (الدفع، التوصيل، كيف يطلب).
- وحدة على الأقل صعبة: صياغة غريبة، كلمة محلية نادرة، طلب مبهم، أو شي برّا شغل التطبيق — الرسائل اللي ممكن ${brand.name} ما يفهمها هي أهم شي هنا.
- لا تكرر نفس الفكرة بصياغتين.

رجّع JSON بس: {"messages":["...","..."]}`;
}

function followUpsPrompt(persona: Persona, exchanges: Exchange[]): string {
  const brand = brandFor(persona.brand);
  const lines = exchanges.map((e, i) => `${i}. أنت كتبت: "${e.message}"\n   ${brand.name} سوّى: ${e.ricoDid}`).join('\n');
  return `أنت نفس الشخصية: ${persona.profile}

هذي رسائلك لـ"${brand.name}" وردّه على كل وحدة:
${lines}

لكل محادثة: لو شخص حقيقي بمكانك بيكمل (${brand.name} سأله سؤال، أو ما فهمه، أو جاب شي غير اللي طلبه، أو تذكّر شي ثاني)، اكتب رسالته الجاية بنفس أسلوبه. ولو كان بيكتفي، حط null. خلّ نصها على الأقل null.

رجّع JSON بس: {"followUps":[{"i":0,"text":"..."|null}]}`;
}

function judgePrompt(exchanges: Exchange[]): string {
  const lines = exchanges
    .map((e, i) => {
      const before = e.history.length ? `   (قبلها بالمحادثة: ${e.history.map((h) => `${h.role === 'user' ? 'الزبون' : 'ريكو'}: "${h.content}"`).join(' ← ')})\n` : '';
      return `${i}.${before ? '\n' + before : ''} الزبون: "${e.message}"\n   ريكو سوّى: ${e.ricoDid}`;
    })
    .join('\n');

  return `أنت مقيّم جودة لمساعد عربي اسمه ريكو (أو تدلل بالأردن). ريكو يقدر يسوّي أربع أشياء بس:
- place: يدوّر على أقرب مكان من فئة (مطعم، كافيه، صيدلية، بقالة، صرّاف، أي نوع محل).
- order: يجهّز طلب أصناف من محل (باسمه، أو بنوعه بس) ويرسله للمحل — المحل يتواصل مع الزبون ويرتّب الاستلام أو التوصيل. ما فيه دفع داخل التطبيق.
- professional: يدوّر على صاحب مهنة (سبّاك، كهربائي، دهّان...).
- deals: يعرض العروض والخصومات.
وغير هذا يرد بنص قصير. **قاعدة الشركة: أي رد نصي لازم يخلص بدعوة الزبون يطلب من ريكو** — إلا رسائل الضيق الشديد وأذية النفس، هذي ما فيها أي شي تجاري.

قيّم كل تبادل بوحدة من:
- "ok": ريكو سوّى الصح (بحث صحيح، طلب صحيح، أو رد نصي مناسب فيه دعوة للطلب).
- "wrong": ريكو فهم غلط — فئة غلط، بحث بدل طلب أو العكس، مهنة غلط، أو فوّت طلب من كذا طلب بنفس الرسالة، أو اخترع شي.
- "not_understood": ريكو قال ما فهم أو سأل توضيح، مع إن الطلب كان مفهوم كفاية لشخص عادي — أو سؤال برّا شغله وريكو ما عرف يتعامل معه بلطف.
- "no_order_push": الرد النصي صحيح بس ما يوجّه الزبون يطلب من ريكو.
- الرسالة الوحدة ممكن فيها كذا طلب (طلب أكل + صاحب مهنة مثلاً)، وريكو المفروض ينفّذها كلها — هذا "ok" مو "wrong".
- "no_order_push" للردود النصية بس. لو ريكو بحث أو جهّز طلب، فهذا بحد ذاته الطريق للطلب.
- "wrong" لما يكون واضح إن شخص عادي بيستغرب اللي سوّاه ريكو — مو لما فيه أكثر من تصرّف معقول.

${lines}

رجّع JSON بس: {"verdicts":[{"i":0,"verdict":"ok"|"wrong"|"not_understood"|"no_order_push","expected":"وش كان المفروض يسوّي، بسطر قصير","note":"ليش، بسطر"}]}`;
}

// ─── One exchange ──────────────────────────────────────────────────────────

type Verdict = 'ok' | 'wrong' | 'not_understood' | 'no_order_push';

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Exchange {
  persona: string;
  brand: string;
  message: string;
  history: HistoryTurn[];
  result: { offTopic: boolean; reply: string | null; intents: any[] } | null;
  error: string | null;
  /** What the customer saw, in one Arabic line — what the persona and the
   * judge read, since neither can see the app's result cards. */
  ricoDid: string;
  /** Set when ClassifyService logged the gap itself (Rico admitted it). */
  selfReported: boolean;
  verdict?: Verdict;
  expected?: string;
  note?: string;
}

/** The result cards the app would draw, as a sentence. The persona needs it
 * to react the way a customer would; the judge needs it to know whether the
 * search was the right one. */
export function describeResult(result: Exchange['result']): string {
  if (!result) return 'ما رد (خطأ بالخادم)';
  if (result.offTopic) return `رد بنص: "${(result.reply ?? '').replace(/\n/g, ' / ')}"`;
  return result.intents
    .map((i: any) => {
      switch (i.kind) {
        case 'order': {
          const items = (i.orderItems ?? []).map((o: any) => `${o.quantity}× ${o.name}`).join('، ') || 'بلا أصناف — فتح قائمة المحل';
          return `جهّز طلب من ${i.placeName ?? `أي ${i.label ?? i.category}`}: ${items}`;
        }
        case 'professional':
          return `دوّر على صاحب مهنة: ${i.label ?? i.profession}`;
        case 'deals':
          return `عرض العروض${i.label && i.label !== 'العروض' ? ` (${i.label})` : ''}`;
        default:
          return `دوّر على ${i.label ?? i.category}${i.brandHint ? ` (${i.brandHint})` : ''} — ${i.rank}`;
      }
    })
    .join(' + ');
}

/** Verdicts that mean "Rico should learn this", as opposed to a reply that
 * understood fine but forgot to sell — the prompt rule fixes that one for
 * every message at once, so a lesson per phrasing would only crowd the
 * prompt's example budget. */
export function needsLesson(verdict: Verdict | undefined): boolean {
  return verdict === 'wrong' || verdict === 'not_understood';
}

// ─── Plumbing ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv: string[]) {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  return {
    personas: get('personas')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
    perPersona: Math.max(1, Math.min(15, Number(get('per-persona') ?? 6))),
    delay: Math.max(0, Number(get('delay') ?? 8000)),
    out: get('out') ?? null,
    dryRun: argv.includes('--dry-run'),
    train: !argv.includes('--no-train') && !argv.includes('--dry-run'),
  };
}

/** LlmService's fetch has no deadline of its own, and one request that never
 * answers would otherwise hold the whole run until the shell gives up on it.
 * A hung call is treated like an unreachable upstream: retried, then dropped. */
const CALL_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject({ response: { error: 'upstream_unreachable' }, message: `no answer in ${ms / 1000}s` }), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** A model call that survives the free tier: a 429 is waited out rather than
 * ending a run that already spent twenty calls getting here. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(fn(), CALL_TIMEOUT_MS);
    } catch (e: any) {
      const status = e?.response?.status;
      if (attempt >= 5 || (status !== 429 && status !== 503 && e?.response?.error !== 'upstream_unreachable')) throw e;
      const wait = 20_000 * (attempt + 1);
      console.warn(`  ↻ ${label}: upstream ${status ?? 'unreachable'}, retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

/** One agent call, parsed. Null rather than a throw: one persona whose model
 * call went wrong should cost that persona, not the run. A 400 from Groq is
 * almost always JSON mode rejecting what a hot sampler wrote, so it gets one
 * cooler retry first. */
async function askJson(llm: LlmService, prompt: string, temperature: number, maxTokens: number): Promise<any> {
  const call = (t: number) =>
    withRetry(
      () => llm.complete({ purpose: 'simulate', messages: [{ role: 'system', content: prompt }], temperature: t, maxTokens }),
      'simulate',
    );
  let content: string;
  try {
    ({ content } = await call(temperature));
  } catch (e: any) {
    if (e?.response?.status !== 400) {
      console.warn(`  agent call failed: ${e?.response?.error ?? e?.message ?? e}${e?.response?.status ? ` (${e.response.status})` : ''}`);
      return null;
    }
    try {
      ({ content } = await call(Math.min(temperature, 0.4)));
    } catch (again: any) {
      console.warn(`  agent call failed twice: ${again?.response?.error ?? again?.message ?? again}`);
      return null;
    }
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const VERDICTS: Verdict[] = ['ok', 'wrong', 'not_understood', 'no_order_push'];

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, LlmModule, LearningModule],
})
class SimulationModule {}

// ─── The run ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // The scheduled training timer has no business in a script that exits.
  process.env.LEARNING_TRAIN_INTERVAL_HOURS = '0';

  const app = await NestFactory.createApplicationContext(SimulationModule, { logger: ['warn', 'error'] });
  const llm = app.get(LlmService);
  const learning = app.get(LearningService);
  const training = app.get(TrainingService);
  const lessonModel = app.get<Model<Lesson>>(getModelToken(Lesson.name));

  const personas = args.personas ? PERSONAS.filter((p) => args.personas!.includes(p.id)) : PERSONAS;
  if (!personas.length) throw new Error(`no persona matches --personas; known: ${PERSONAS.map((p) => p.id).join(', ')}`);

  // ClassifyService logs a gap the moment Rico admits it didn't understand.
  // Routed through here so those land tagged 'simulated', and so the judge
  // step knows not to log the same question twice.
  let lastSelfReport: string | null = null;
  const tagged = {
    record: async (entry: GapRecord) => {
      lastSelfReport = entry.message;
      if (!args.dryRun) await learning.record({ ...entry, source: 'simulated' });
    },
  } as unknown as LearningService;
  const classifier = new ClassifyService(llm, tagged);

  async function classify(persona: Persona, message: string, history: HistoryTurn[]): Promise<Exchange> {
    lastSelfReport = null;
    const base = { persona: persona.id, brand: persona.brand, message, history };
    try {
      const result = await withRetry(() => classifier.classify({ message, brand: persona.brand, history } as any), 'classify');
      // record() is fire-and-forget inside classify; give it a tick to land.
      await sleep(50);
      return { ...base, result, error: null, ricoDid: describeResult(result), selfReported: lastSelfReport === message };
    } catch (e: any) {
      const error = String(e?.response?.error ?? e?.message ?? e);
      return { ...base, result: null, error, ricoDid: describeResult(null), selfReported: false };
    } finally {
      await sleep(args.delay);
    }
  }

  const startedAt = new Date();
  const all: Exchange[] = [];

  for (const persona of personas) {
    console.log(`\n━━ ${persona.id} (${brandFor(persona.brand).name}) ━━`);

    const generated = await askJson(llm, openersPrompt(persona, args.perPersona), 0.9, 1500);
    await sleep(args.delay);
    const openers: string[] = (Array.isArray(generated?.messages) ? generated.messages : [])
      .filter((m: unknown): m is string => typeof m === 'string' && m.trim().length > 0)
      .map((m: string) => m.trim().slice(0, 300))
      .slice(0, args.perPersona);
    if (!openers.length) {
      console.warn('  persona wrote nothing usable, skipping');
      continue;
    }

    const exchanges: Exchange[] = [];
    for (const message of openers) exchanges.push(await classify(persona, message, []));

    // The second turn: where a real conversation carries on, so does this one.
    // A server error is the harness failing, not Rico — a customer reacting to
    // it, or a judge grading it, would only teach Rico about rate limits.
    const answered = exchanges.filter((e) => !e.error);
    const replies = answered.length ? await askJson(llm, followUpsPrompt(persona, answered), 0.8, 1200) : null;
    await sleep(args.delay);
    const followUps: { i: number; text: string }[] = (Array.isArray(replies?.followUps) ? replies.followUps : []).filter(
      (f: any) => Number.isInteger(f?.i) && f.i >= 0 && f.i < answered.length && typeof f.text === 'string' && f.text.trim(),
    );
    for (const f of followUps) {
      const first = answered[f.i];
      const history: HistoryTurn[] = [
        { role: 'user', content: first.message },
        { role: 'assistant', content: (first.result?.reply ?? first.ricoDid).slice(0, 300) },
      ];
      exchanges.push(await classify(persona, f.text.trim().slice(0, 300), history));
    }

    const toGrade = exchanges.filter((e) => !e.error);
    const graded = toGrade.length ? await askJson(llm, judgePrompt(toGrade), 0.1, 2500) : null;
    await sleep(args.delay);
    for (const v of Array.isArray(graded?.verdicts) ? graded.verdicts : []) {
      const e = Number.isInteger(v?.i) ? toGrade[v.i] : undefined;
      if (!e || !VERDICTS.includes(v.verdict)) continue;
      // The selling rule is about text replies. A search or a basket is
      // already the way to an order, whatever the judge made of it.
      e.verdict = v.verdict === 'no_order_push' && !e.result?.offTopic ? 'ok' : v.verdict;
      e.expected = typeof v.expected === 'string' ? v.expected : undefined;
      e.note = typeof v.note === 'string' ? v.note : undefined;
    }

    for (const e of exchanges) {
      const mark = e.error ? '✗ error' : e.verdict === 'ok' ? '✓' : `✗ ${e.verdict ?? 'ungraded'}`;
      console.log(`  ${mark.padEnd(16)} ${e.history.length ? '↳ ' : ''}${e.message}`);
      if (e.verdict !== 'ok') console.log(`  ${''.padEnd(16)}   ريكو: ${e.ricoDid}${e.expected ? `\n  ${''.padEnd(16)}   المفروض: ${e.expected}` : ''}`);

      // A wrong answer Rico gave with confidence never reaches the queue on
      // its own — only "I didn't understand" does. This is where those get in.
      if (!args.dryRun && !e.error && needsLesson(e.verdict) && !e.selfReported) {
        await learning.record({
          message: e.message,
          brand: e.brand,
          dialect: brandFor(e.brand).dialect,
          ricoReply: e.ricoDid.slice(0, 300),
          source: 'simulated',
        });
      }
    }
    all.push(...exchanges);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  const count = (pred: (e: Exchange) => boolean) => all.filter(pred).length;
  const textReplies = all.filter((e) => e.result?.offTopic);
  const queued = all.filter((e) => e.selfReported || (!e.error && needsLesson(e.verdict)));
  console.log('\n━━ النتيجة ━━');
  console.log(`  تبادلات: ${all.length}  |  ✓ صح: ${count((e) => e.verdict === 'ok')}  |  فهم غلط: ${count((e) => e.verdict === 'wrong')}  |  ما فهم: ${count((e) => e.verdict === 'not_understood')}  |  أخطاء خادم: ${count((e) => !!e.error)}`);
  console.log(`  ردود نصية بلا دعوة للطلب: ${count((e) => e.verdict === 'no_order_push')} من ${textReplies.length}`);
  console.log(`  ${args.dryRun ? 'كانت بتنضاف' : 'انضافت'} لطابور التعلّم: ${queued.length}`);

  if (args.train && queued.length) {
    console.log('\n━━ جولة تدريب ━━');
    // Training rides the same rate-limited chain as everything above, and
    // fails into a run row rather than throwing — so a 429 is read off the
    // row and waited out here.
    let run: any = await training.train('simulation');
    for (let attempt = 1; attempt <= 3 && run.errorStatus === 429; attempt++) {
      console.log(`  ↻ training: upstream 429, retrying in ${30 * attempt}s`);
      await sleep(30_000 * attempt);
      run = await training.train('simulation');
    }
    if (run.skipped) console.log(`  تخطّت: ${run.skipped}`);
    else if (run.error) console.log(`  فشلت: ${run.error}${run.errorStatus ? ` (${run.errorStatus})` : ''}`);
    else console.log(`  قرأت ${run.gapsConsidered} فجوة واقترحت ${run.proposalsCreated} درس`);

    const proposals = await lessonModel.find({ createdAt: { $gte: startedAt }, status: 'pending' }).lean();
    for (const p of proposals) {
      const what = p.kind === 'profession' ? `مهنة جديدة: ${(p.profession as any)?.label}` : p.reply ? `رد: ${p.reply.replace(/\n/g, ' / ')}` : `نوايا: ${JSON.stringify(p.intents)}`;
      console.log(`  • [${p.kind}] "${p.message}" → ${what}`);
    }
    if (proposals.length) console.log('\n  الاقتراحات بانتظار موافقتك بلوحة المالك ← تعلّم ريكو.');
  }

  if (args.out) {
    writeFileSync(args.out, JSON.stringify({ startedAt, args, exchanges: all }, null, 2));
    console.log(`\n  التقرير الكامل: ${args.out}`);
  }

  await app.close();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
