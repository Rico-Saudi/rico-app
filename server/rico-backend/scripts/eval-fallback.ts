/**
 * يشغّل أسئلة الوكلاء (scripts/agent-corpus) على فهم ريكو الاحتياطي
 * بالكلمات، ويطبع كل سؤال ما فهمه صح.
 *
 * Free and instant — no model call, no database. Run it after any change to
 * keyword-tables.ts:
 *
 *   npx ts-node -r tsconfig-paths/register scripts/eval-fallback.ts [--all] [--file=events]
 */
import { join } from 'path';
import { keywordClassify } from '../src/classify/fallback/keyword-classifier';
import { grade, Grade, intentKey, loadCorpus } from '../src/classify/fallback/corpus-grading';

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const only = args.find((a) => a.startsWith('--file='))?.split('=')[1];
const dir = args.find((a) => a.startsWith('--dir='))?.split('=')[1] ?? join(__dirname, 'agent-corpus');

const lines = loadCorpus(dir).filter((l) => !only || l.file.startsWith(only));
const counts: Record<Grade, number> = {
  pass: 0,
  partial: 0,
  miss: 0,
  wrong: 0,
  false_positive: 0,
};

for (const line of lines) {
  const intents = keywordClassify(line.msg);
  const g = grade(line.expect, intents);
  counts[g]++;
  if (g !== 'pass' || showAll) {
    const got = intents.map(intentKey).join(' + ') || '—';
    console.log(`${g.padEnd(15)} ${line.msg}  ⟵ expected ${line.expect}  ⟵ got ${got}`);
  }
}

const total = lines.length;
const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`;
console.log(
  `\n${total} questions — pass ${counts.pass} (${pct(counts.pass)}), partial ${counts.partial}, miss ${counts.miss}, wrong ${counts.wrong}, false positive ${counts.false_positive}`,
);
