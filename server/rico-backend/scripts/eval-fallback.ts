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
import { keywordClassifyInContext } from '../src/classify/fallback/keyword-classifier';
import { grade, Grade, gradeFollowUp, gradeOrder, intentKey, loadCorpus } from '../src/classify/fallback/corpus-grading';

const args = process.argv.slice(2);
const showAll = args.includes('--all');
// --orders: also print every order whose shop or items came out wrong.
const showOrders = args.includes('--orders');
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

const orderStats = { total: 0, found: 0, shop: 0, items: 0, both: 0 };

for (const line of lines) {
  const intents = keywordClassifyInContext(line.msg, { history: line.history ?? [], lastResults: line.lastResults ?? null });
  let g = grade(line.expect, intents);
  // A refinement that lost its rank, or a pointer that lost its position.
  if (g === 'pass' && !gradeFollowUp(line, intents)) g = 'partial';
  if (line.order && line.expect.includes('order')) {
    const o = gradeOrder(line.order, intents);
    orderStats.total++;
    if (o.found) orderStats.found++;
    if (o.shop) orderStats.shop++;
    if (o.items) orderStats.items++;
    if (o.shop && o.items) orderStats.both++;
    // An order with the wrong shop or basket isn't a pass, whatever its kind.
    if (g === 'pass' && !(o.shop && o.items)) g = 'partial';
    if (showOrders && o.found && !(o.shop && o.items)) {
      const got = intents.find((i) => i.kind === 'order')!;
      console.log(`order ${o.shop ? '' : '[shop] '}${o.items ? '' : '[items] '}${line.msg}\n   expected ${JSON.stringify(line.order)}\n   got      ${JSON.stringify({ placeName: got.placeName, category: got.category, position: got.referencedPosition, items: got.orderItems })}`);
    }
  }
  counts[g]++;
  if (g !== 'pass' || showAll) {
    const got = intents.map(intentKey).join(' + ') || '—';
    console.log(`${g.padEnd(15)} ${line.msg}  ⟵ expected ${line.expect}  ⟵ got ${got}`);
  }
}

if (orderStats.total) {
  const op = (n: number) => `${((100 * n) / orderStats.total).toFixed(1)}%`;
  console.log(
    `\norders: ${orderStats.total} — recognised ${op(orderStats.found)}, right shop ${op(orderStats.shop)}, right basket ${op(orderStats.items)}, both ${op(orderStats.both)}`,
  );
}

const total = lines.length;
const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`;
console.log(
  `\n${total} questions — pass ${counts.pass} (${pct(counts.pass)}), partial ${counts.partial}, miss ${counts.miss}, wrong ${counts.wrong}, false positive ${counts.false_positive}`,
);
