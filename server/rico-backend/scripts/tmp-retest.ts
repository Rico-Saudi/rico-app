const B = '../src/';
const { ClassifyService } = require(B + 'classify/classify.service');
const { LlmService } = require(B + 'llm/llm.service');
const fs = require('fs');
const registry = require('../src/professionals/constants/professions.registry');
const fullProfessionLines = registry.professionPromptLines;
registry.professionPromptLines = () =>
  'الصيانة المنزلية: كهربائي=electrician، سبّاك=plumber، دهّان=painter، نجّار=carpenter، فني تكييف=ac_technician\n' +
  'خدمات شخصية: خيّاط=tailor، مصوّر=photographer، أخصائي مساج=massage_therapist';


const OUT = '/dev/null';

interface Q { g: string; m: string; b?: string; h?: any[]; lr?: any }

const jo = 'tadallal', sa = 'rico';

const QUESTIONS: Q[] = [
  { g: 'إعادة', m: 'حران والجو خانق', b: jo },
  { g: 'إعادة', m: 'أنا مريض', b: jo },
  { g: 'إعادة', m: 'مبسوط اليوم نجحت', b: jo },
  { g: 'إعادة', m: 'طفشان', b: jo },
  { g: 'إعادة', m: 'جوعان بس ما بدي مطعم', b: jo },
  { g: 'تراجع', m: 'انا زعلان', b: jo },
  { g: 'تراجع', m: 'أنا جوعان', b: jo },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function line(s: string) {
  fs.appendFileSync(OUT, s + '\n');
  console.log(s);
}

async function main() {
  const service = new ClassifyService(new LlmService());
  const only = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
  const list = only ? QUESTIONS.slice(only - 1, only) : QUESTIONS;

  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const t = Date.now();
        const r = await service.classify({ message: q.m, brand: q.b, history: q.h, lastResults: q.lr } as any);
        const intents = (r.intents || []).map((x: any) => `${x.kind}:${x.category ?? x.profession ?? x.placeName ?? x.label ?? ''}/${x.rank}`).join(' + ');
        line(`\n[${i + 1}/${list.length}] (${q.g}) «${q.m}»${q.b === sa ? ' [سعودي]' : ''}${q.h ? ' [+history]' : ''}${q.lr ? ' [+lastResults]' : ''}  ${Date.now() - t}ms`);
        line(`  offTopic=${r.offTopic}  mood=${(r as any).mood}  intents=[${intents}]`);
        if (r.reply) line('  reply: ' + String(r.reply).replace(/\n/g, '\n         '));
        break;
      } catch (e: any) {
        const st = e?.response?.status ?? e?.response?.error ?? e?.message;
        if (attempt >= 4) { line(`\n[${i + 1}] «${q.m}» → ERROR ${st} (gave up)`); break; }
        await sleep(130000);
      }
    }
    if (i < list.length - 1) await sleep(62000);
  }
  line('\n=== DONE ===');
}
void main();
