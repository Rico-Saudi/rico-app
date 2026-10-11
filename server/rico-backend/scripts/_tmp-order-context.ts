// Temporary: deep check of "order from a shop in the last list" against the real model.
import { ClassifyService } from '../src/classify/classify.service';
import { LlmService } from '../src/llm/llm.service';
import { LearningService } from '../src/learning/learning.service';

const list = { label: 'مطعم', items: [
  { position: 1, name: 'مطعم القدس' }, { position: 2, name: 'مطعم الماهر' }, { position: 3, name: 'شاورما الريم' } ] };
const one = { label: 'مطعم', items: [{ position: 1, name: 'مطعم الماهر' }] };
const h = (q: string, a = 'هذي أقرب المطاعم لموقعك: مطعم القدس، مطعم الماهر، شاورما الريم') =>
  [{ role: 'user', content: q }, { role: 'assistant', content: a }];

type Exp = { kind?: string; pos?: number | null; items?: [string, number][]; rank?: string; offTopic?: boolean; count?: number; placeName?: boolean };
const cases: { b: string; m: string; lr?: any; hi?: any; e: Exp[]; note: string }[] = [
  { b: 'rico', m: 'أبغى أطلب من الثاني', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'order', pos: 2, items: [] }], note: 'order by ordinal, no dishes' },
  { b: 'rico', m: 'اطلب لي من مطعم الماهر شاورما', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'order', pos: 2, items: [['شاورما', 1]] }], note: 'order by name that is in the list' },
  { b: 'rico', m: 'أبي من الأول وجبتين شاورما', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'order', pos: 1, items: [['شاورما', 2]] }], note: 'ordinal + quantity' },
  { b: 'rico', m: 'اطلب لي منه كنافة', lr: one, hi: h('الثاني', 'هذا مطعم الماهر، قريب منك'), e: [{ kind: 'order', pos: 1, items: [['كنافة', 1]] }], note: 'pronoun after picking one' },
  { b: 'rico', m: 'وش عندهم في الثالث؟ أبي أطلب', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'order', pos: 3, items: [] }], note: 'menu of #3' },
  { b: 'rico', m: 'جهّز لي من شاورما الريم ٣ سندويشات', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'order', pos: 3 }], note: 'name + quantity' },
  { b: 'rico', m: 'أبي أطلب من الثاني والثالث كنافة', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'order', pos: 2 }, { kind: 'order', pos: 3 }], note: 'two shops in one message' },
  { b: 'rico', m: 'أبي أطلب برجر من مطعم ثاني غير هذول', lr: list, hi: h('وش المطاعم القريبة'), e: [{ pos: null }], note: 'TRAP: "ثاني" = another, not #2' },
  { b: 'rico', m: 'أبي أطلب من مطعم البيك', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'order', pos: null, placeName: true }], note: 'named shop NOT in the list' },
  { b: 'rico', m: 'الثاني', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'place', pos: 2 }], note: 'REGRESSION: plain reference stays a place' },
  { b: 'rico', m: 'الأخير', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'place', pos: 3 }], note: 'REGRESSION: last' },
  { b: 'rico', m: 'فيه مثله بس أرخص؟', lr: list, hi: h('وش المطاعم القريبة'), e: [{ kind: 'place', pos: null, rank: 'cheapest' }], note: 'REGRESSION: similar-but-cheaper' },
  { b: 'rico', m: 'شكراً', lr: list, hi: h('وش المطاعم القريبة'), e: [], note: 'REGRESSION: thanks is not an order' },
  { b: 'rico', m: 'اطلب لي من مطعم الماهر كنافة', e: [{ kind: 'order', pos: null, placeName: true, items: [['كنافة', 1]] }], note: 'REGRESSION: named order with no list' },
  { b: 'rico', m: 'وصّلي من مطعم وجبتين شاورما', e: [{ kind: 'order', pos: null, items: [['شاورما', 2]] }], note: 'REGRESSION: category order with no list' },
  { b: 'tadallal', m: 'بدي أطلب من التاني', lr: list, hi: h('شو المطاعم القريبة', 'هاي أقرب المطاعم إلك'), e: [{ kind: 'order', pos: 2, items: [] }], note: 'JO ordinal' },
  { b: 'tadallal', m: 'وصّيلي من شاورما الريم ٣ سندويشات', lr: list, hi: h('شو المطاعم القريبة', 'هاي أقرب المطاعم إلك'), e: [{ kind: 'order', pos: 3 }], note: 'JO name + qty' },
  { b: 'tadallal', m: 'شو عندهم؟', lr: one, hi: h('التاني', 'هاد مطعم الماهر، قريب منك'), e: [{ kind: 'order', pos: 1, items: [] }], note: 'JO pronoun menu' },
  { b: 'tadallal', m: 'اطلبلي من أول واحد كنافتين', lr: list, hi: h('شو المطاعم القريبة', 'هاي أقرب المطاعم إلك'), e: [{ kind: 'order', pos: 1, items: [['كنافة', 2]] }], note: 'JO ordinal + dual' },
  { b: 'tadallal', m: 'التالت', lr: list, hi: h('شو المطاعم القريبة', 'هاي أقرب المطاعم إلك'), e: [{ kind: 'place', pos: 3 }], note: 'JO REGRESSION: plain ref' },
  { b: 'tadallal', m: 'في متله بس أحسن تقييم؟', lr: list, hi: h('شو المطاعم القريبة', 'هاي أقرب المطاعم إلك'), e: [{ kind: 'place', pos: null, rank: 'best_rated' }], note: 'JO REGRESSION: similar' },
  { b: 'tadallal', m: 'بدي أطلب من مطعم الماهر', e: [{ kind: 'order', pos: null, placeName: true, items: [] }], note: 'JO REGRESSION: named, no list' },
];

const norm = (x: string) => x.replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
function appShop(lr: any, got: any): number | null {
  const items: { position: number; name: string }[] = lr?.items ?? [];
  if (got.placeName) {
    const w = norm(got.placeName);
    if (w.length >= 3) {
      const exact = items.filter((i) => norm(i.name) === w);
      if (exact.length) return exact.length === 1 ? exact[0].position : null;
      const part = items.filter((i) => norm(i.name).includes(w) || w.includes(norm(i.name)));
      if (part.length === 1) return part[0].position;
    }
  }
  const p = got.referencedPosition;
  return p && p >= 1 && p <= items.length ? p : null;
}

function check(r: any, e: Exp[], lr?: any): string[] {
  const errs: string[] = [];
  if (e.length === 0) { if (!r.offTopic) errs.push('expected offTopic'); return errs; }
  if (r.offTopic) return ['got offTopic: ' + r.reply];
  if (r.intents.length !== e.length) errs.push(`expected ${e.length} intents, got ${r.intents.length}`);
  e.forEach((x, i) => {
    const got = r.intents[i]; if (!got) return;
    if (x.kind && got.kind !== x.kind) errs.push(`#${i} kind ${got.kind}≠${x.kind}`);
    if (x.pos !== undefined) {
      // For orders what matters is the shop the app ends up ordering from.
      const shopPos = got.kind === 'order' ? appShop(lr, got) : got.referencedPosition;
      if (shopPos !== x.pos) errs.push(`#${i} shop ${shopPos}≠${x.pos}`);
    }
    if (x.rank && got.rank !== x.rank) errs.push(`#${i} rank ${got.rank}≠${x.rank}`);
    if (x.placeName && !got.placeName) errs.push(`#${i} missing placeName`);
    if (x.items) {
      const items = (got.orderItems ?? []).map((o: any) => [o.name, o.quantity]);
      if (items.length !== x.items.length || x.items.some(([n, q], j) => !items[j] || !String(items[j][0]).includes(n.slice(0, 3)) || items[j][1] !== q))
        errs.push(`#${i} items ${JSON.stringify(items)}≠${JSON.stringify(x.items)}`);
    }
  });
  return errs;
}

(async () => {
  const service = new ClassifyService(new LlmService(), { record: async () => {} } as unknown as LearningService);
  let pass = 0;
  const only = process.env.ONLY?.split(",").map(Number);
  const run = only ? cases.filter((_, i) => only.includes(i)) : cases.slice(Number(process.env.SKIP ?? 0));
  for (const c of run) {
    let r: any; let errs: string[];
    for (let attempt = 0; ; attempt++) {
      await new Promise((res) => setTimeout(res, 75_000));
      try { r = await Promise.race([service.classify({ message: c.m, brand: c.b, lastResults: c.lr, history: c.hi } as any), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 60s')), 60_000))]); errs = check(r, c.e, c.lr); break; }
      catch (err: any) { if (attempt >= 2) { r = null; errs = ['ERROR ' + JSON.stringify(err.getResponse?.() ?? err.message)]; break; } }
    }
    if (errs.length === 0) pass++;
    const short = r ? (r.offTopic ? 'offTopic' : JSON.stringify(r.intents.map((i: any) => ({ k: i.kind, pos: i.referencedPosition, pn: i.placeName, it: i.orderItems?.map((o: any) => `${o.name}×${o.quantity}`), cat: i.category, rank: i.rank })))) : '-';
    console.log(`${errs.length ? 'FAIL' : 'PASS'} [${c.b}] ${c.m}  (${c.note})\n     ${short}${errs.length ? '\n     ✗ ' + errs.join('; ') : ''}`);
  }
  console.log(`\n${pass}/${run.length} passed`);
})();
