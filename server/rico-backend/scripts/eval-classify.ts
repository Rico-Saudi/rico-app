/**
 * Measures how well a model classifies real Arabic requests, so the choice of
 * model is a measurement rather than a preference.
 *
 * Runs the *production* path — the same prompt builder, the same validateIntent
 * — through the LLM gateway, so a score here is a score the app would get.
 *
 *   OPENROUTER_API_KEY=... npx ts-node scripts/eval-classify.ts \
 *     google/gemini-3-flash groq/llama-3.3-70b meta-llama/llama-4
 *
 * With no arguments it evaluates whatever the current config already uses, so
 * it doubles as a regression check after a prompt edit.
 */
import { ClassifyService } from '../src/classify/classify.service';
import { LlmService } from '../src/llm/llm.service';

export interface Expected {
  kind: 'place' | 'deals' | 'professional';
  category?: string;
  profession?: string;
  rank?: string;
}

interface Case {
  /** What a user actually types. Dialect, not textbook Arabic. */
  message: string;
  brand?: 'rico' | 'tadallal';
  /** Empty means: this should be recognised as off-topic. */
  expect: Expected[];
  /** Why this case exists — printed when it fails. */
  note: string;
}

export const CASES: Case[] = [
  // --- the ordinary path -------------------------------------------------
  { message: 'أقرب مطعم', expect: [{ kind: 'place', category: 'restaurant', rank: 'nearest' }], note: 'the simplest possible request' },
  { message: 'وين ألقى قهوة زينة قريبة مني', expect: [{ kind: 'place', category: 'cafe' }], note: 'dialect phrasing, no keyword "كافيه"' },
  { message: 'أبغى أرخص صيدلية', expect: [{ kind: 'place', category: 'pharmacy', rank: 'cheapest' }], note: 'explicit cheapest' },
  { message: 'مطعم مفتوح الحين', expect: [{ kind: 'place', category: 'restaurant', rank: 'open_now' }], note: 'explicit open-now' },
  { message: 'أحسن مطعم من ناحية التقييم', expect: [{ kind: 'place', category: 'restaurant', rank: 'best_rated' }], note: 'explicit best-rated' },

  // --- multi-intent: the prompt calls this a recurring source of errors ---
  {
    message: 'وش أقرب مطعم أو أرخص كافيه، وايش العروض المتوفرة؟',
    expect: [
      { kind: 'place', category: 'restaurant', rank: 'nearest' },
      { kind: 'place', category: 'cafe', rank: 'cheapest' },
      { kind: 'deals' },
    ],
    note: 'three independent requests in one message — must not collapse to one',
  },
  {
    message: 'أبي بقالة وصراف',
    expect: [
      { kind: 'place', category: 'supermarket' },
      { kind: 'place', category: 'atm' },
    ],
    note: 'two requests joined by و',
  },

  // --- a person who does a trade, not a shop that sells its tools --------
  { message: 'أبغى دهان', expect: [{ kind: 'professional', profession: 'painter' }], note: 'a painter — NOT a paint shop' },
  { message: 'محتاج كهربائي ضروري', expect: [{ kind: 'professional', profession: 'electrician' }], note: 'tradesperson, urgent phrasing' },
  { message: 'وين أشتري دهانات', expect: [{ kind: 'place' }], note: 'buying paint IS a shop — the mirror of the case above' },

  // --- free-text categories with no fixed slug --------------------------
  { message: 'أقرب مغسلة سيارات', expect: [{ kind: 'place', category: 'other' }], note: 'category we have no slug for' },
  { message: 'أقرب ستاربكس', expect: [{ kind: 'place', category: 'cafe' }], note: 'named brand' },

  // --- deals ------------------------------------------------------------
  { message: 'فيه خصومات قريبة؟', expect: [{ kind: 'deals' }], note: 'deals, no place category' },

  // --- off-topic: the regression that started the keyword guard ---------
  { message: 'هلا', expect: [], note: 'a greeting must NOT become a restaurant search' },
  { message: 'شكراً يا ريكو', expect: [], note: 'thanks is not a search' },
  { message: 'كيف حالك اليوم', expect: [], note: 'small talk is not a search' },

  // --- Jordanian, to check the second brand's dialect -------------------
  { message: 'بدي أقرب مطعم', brand: 'tadallal', expect: [{ kind: 'place', category: 'restaurant' }], note: 'Jordanian بدي' },
  { message: 'وين في صيدلية فاتحة هلأ', brand: 'tadallal', expect: [{ kind: 'place', category: 'pharmacy', rank: 'open_now' }], note: 'Jordanian هلأ = now' },
];

/** One expectation is met if every field it names matches. Fields it omits
 * are deliberately not checked — most cases care about the category, not
 * whether the model also guessed a rank. */
export function matches(actual: any, expected: Expected): boolean {
  if (actual.kind !== expected.kind) return false;
  if (expected.category && actual.category !== expected.category) return false;
  if (expected.profession && actual.profession !== expected.profession) return false;
  if (expected.rank && actual.rank !== expected.rank) return false;
  return true;
}

/** Order-insensitive: "restaurant and cafe" is as correct as "cafe and
 * restaurant". Counts must match, so a model that returns one of three
 * requests fails rather than scoring partial credit. */
export function scoreCase(intents: any[], expected: Expected[]): boolean {
  if (intents.length !== expected.length) return false;
  const pool = [...intents];
  for (const want of expected) {
    const i = pool.findIndex((got) => matches(got, want));
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
}

async function runModel(model: string | null): Promise<void> {
  if (model) process.env.OPENROUTER_CLASSIFY_MODELS = model;
  const service = new ClassifyService(new LlmService());

  let passed = 0;
  let totalMs = 0;
  const failures: string[] = [];

  for (const testCase of CASES) {
    const started = Date.now();
    let intents: any[] = [];
    let errored: string | null = null;

    try {
      const result = await service.classify({
        message: testCase.message,
        brand: testCase.brand ?? 'rico',
      } as any);
      intents = result.offTopic ? [] : result.intents;
    } catch (e: any) {
      // invalid_intents is thrown for a response with nothing usable in it,
      // which for an off-topic case is the right answer arriving the wrong way.
      const code = e?.response?.error ?? e?.message;
      if (code === 'invalid_intents') intents = [];
      else errored = String(code);
    }

    totalMs += Date.now() - started;

    if (errored) {
      failures.push(`  ✗ "${testCase.message}" → ERROR ${errored}\n      ${testCase.note}`);
    } else if (scoreCase(intents, testCase.expect)) {
      passed++;
    } else {
      const got = intents.length === 0 ? 'offTopic' : intents.map((i) => `${i.kind}:${i.category ?? i.profession ?? ''}`).join(', ');
      const want = testCase.expect.length === 0 ? 'offTopic' : testCase.expect.map((e) => `${e.kind}:${e.category ?? e.profession ?? ''}`).join(', ');
      failures.push(`  ✗ "${testCase.message}"\n      want ${want}\n      got  ${got}\n      ${testCase.note}`);
    }
  }

  const pct = ((passed / CASES.length) * 100).toFixed(0);
  const avg = (totalMs / CASES.length).toFixed(0);
  console.log(`\n${model ?? '(current config)'} — ${passed}/${CASES.length} (${pct}%), ${avg}ms avg`);
  if (failures.length) console.log(failures.join('\n'));
}

async function main() {
  const models = process.argv.slice(2);

  if (models.length > 0) {
    process.env.LLM_PROVIDER = 'openrouter';
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY is required when naming models to compare.');
      process.exit(1);
    }
  }

  console.log(`${CASES.length} cases`);
  // Sequentially, not in parallel: free tiers cap requests per minute, and a
  // burst would measure the rate limiter rather than the model.
  for (const model of models.length > 0 ? models : [null]) {
    await runModel(model);
  }
}

if (require.main === module) void main();
