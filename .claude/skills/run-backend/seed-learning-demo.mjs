// Demo data for the owner dashboard's «تعليم ريكو» tab.
//
// It fakes what ClassifyService.record() would have written if an LLM key
// were configured — five unanswered questions and one pending proposal of
// each kind the training run can produce. Say in your report that this data
// is seeded, not captured from real traffic.
//
//   node .claude/skills/run-backend/seed-learning-demo.mjs "$URI"
//
// Run it from server/rico-backend: an ESM import would resolve against this
// file's own directory, which has no node_modules, so the driver is required
// relative to the working directory instead.
import { createRequire } from 'node:module';
const { MongoClient } = createRequire(`${process.cwd()}/`)('mongodb');

const uri = process.argv[2];
if (!uri) throw new Error('usage: seed-learning-demo.mjs <mongodb-uri>');

const client = await new MongoClient(uri).connect();
const db = client.db();
const gaps = db.collection('knowledgegaps');
const lessons = db.collection('lessons');
await gaps.deleteMany({});
await lessons.deleteMany({});

const now = new Date();
const ago = (m) => new Date(now - m * 60000);
const rows = [
  { message: 'بدي حدا يصلّح لي البويلر', variants: ['بدي حدا يصلّح لي البويلر', 'بدي بويلرجي!!'], count: 7, dialect: 'jordanian', brands: ['tadallal'], lastSeenAt: ago(35) },
  { message: 'وين ألاقي محل يعبّي غاز', variants: ['وين ألاقي محل يعبّي غاز'], count: 4, dialect: 'jordanian', brands: ['tadallal'], lastSeenAt: ago(190) },
  { message: 'أبغى أحد يركب لي ستلايت', variants: ['أبغى أحد يركب لي ستلايت'], count: 3, dialect: 'saudi', brands: ['rico'], lastSeenAt: ago(400) },
  { message: 'كم نتيجة مباراة الهلال اليوم', variants: ['كم نتيجة مباراة الهلال اليوم'], count: 5, dialect: 'saudi', brands: ['rico'], lastSeenAt: ago(70) },
  { message: 'بدي إشي يسد الجوع بس مش مطعم', variants: ['بدي إشي يسد الجوع بس مش مطعم'], count: 2, dialect: 'jordanian', brands: ['tadallal'], lastSeenAt: ago(900) },
];

const ids = [];
for (const r of rows) {
  const { insertedId } = await gaps.insertOne({
    normalized: r.message.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه'),
    ...r, ricoReply: 'ما ضبطت معي هاي 😅 وضّح لي أكتر شو بدك', status: 'open',
    lessonId: null, createdAt: r.lastSeenAt, updatedAt: r.lastSeenAt,
  });
  ids.push(insertedId);
}

// Three pending proposals — one of each kind a training run can produce.
const pending = [
  { kind: 'profession', message: 'بدي حدا يصلّح لي البويلر', dialect: 'jordanian', intents: [], reply: null,
    profession: { slug: 'boiler_technician', label: 'فني بويلرات وسخانات', group: 'maintenance', aliases: ['بويلر', 'بويلرجي', 'سخان مركزي'] },
    note: 'تكرر ٧ مرات وما في مهنة بالقائمة تغطي صيانة البويلرات.', gapIds: [ids[0]], coverage: 1 },
  { kind: 'example', message: 'بدي إشي يسد الجوع بس مش مطعم', dialect: 'jordanian',
    intents: [{ kind: 'place', category: 'bakery', rank: 'nearest', brandHint: null, customTag: null, label: null, referencedPosition: null, profession: null }],
    reply: null, note: 'جوع + رفض المطعم = مخبز، مش سؤال توضيح.', gapIds: [ids[4]], coverage: 1 },
  { kind: 'skip', message: 'أخبار رياضية', dialect: 'any', intents: [], reply: null, profession: null,
    note: 'نتائج المباريات خارج نطاق ريكو تماماً.', gapIds: [ids[3]], coverage: 1 },
];

for (const p of pending) {
  await lessons.insertOne({ ...p, status: 'pending', source: 'model', reviewedBy: null, reviewedAt: null, createdAt: now, updatedAt: now });
  await gaps.updateMany({ _id: { $in: p.gapIds } }, { $set: { status: 'proposed' } });
}

console.log(`seeded ${ids.length} gaps, ${pending.length} pending proposals`);
await client.close();
