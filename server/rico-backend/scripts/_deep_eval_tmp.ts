import 'dotenv/config';
import { CASES, scoreCase } from './eval-classify';
import { ClassifyService } from '../src/classify/classify.service';
import { LlmService } from '../src/llm/llm.service';
import { LearningService } from '../src/learning/learning.service';
import { isDistress } from '../src/classify/constants/distress';

// Pairs back-to-back so the second call of each pair meets the 120b's
// per-minute cap and must fail over to the 20b; then a minute's rest.
(async () => {
  const warns: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: any[]) => { warns.push(a.join(' ')); };
  const service = new ClassifyService(new LlmService(), { record: async () => {} } as unknown as LearningService);
  let passed = 0, llmBound = 0, failovers = 0;
  const failures: string[] = [];
  for (const c of CASES) {
    const gated = isDistress(c.message);
    if (!gated) {
      llmBound++;
      if (llmBound > 1 && llmBound % 2 === 1) await new Promise((r) => setTimeout(r, 62000));
    }
    const before = warns.length;
    let got = 'ERROR';
    let ok = false;
    const t = Date.now();
    try {
      const r = await service.classify({ message: c.message, brand: c.brand ?? 'rico' } as any);
      const intents = r.offTopic ? [] : r.intents;
      ok = scoreCase(intents, c.expect);
      got = intents.length === 0 ? `offTopic "${(r.reply || '').slice(0, 50)}"` : intents.map((i: any) => `${i.kind}:${i.category ?? i.profession ?? ''}${i.rank ? '/' + i.rank : ''}`).join(', ');
    } catch (e: any) { got = `ERROR ${e?.response?.error ?? e?.message} ${e?.response?.status ?? ''}`; }
    const fell = warns.length > before ? ' [FAILOVER→20b]' : '';
    if (fell) failovers++;
    if (ok) passed++; else failures.push(`✗ ${c.message} | want ${c.expect.length === 0 ? 'offTopic' : c.expect.map((e) => `${e.kind}:${e.category ?? e.profession ?? ''}`).join(', ')} | got ${got}`);
    console.log(`${ok ? '✓' : '✗'} ${gated ? '[GATE]' : '[LLM ]'} ${c.message.padEnd(40)} ${got.slice(0, 80)}${fell} ${Date.now() - t}ms`);
  }
  console.warn = origWarn;
  console.log(`\n${passed}/${CASES.length} passed, ${llmBound} model-bound, ${failovers} failovers to 20b`);
  if (failures.length) console.log(failures.join('\n'));
  if (warns.length) console.log('\nwarnings:\n' + warns.join('\n'));
})();
