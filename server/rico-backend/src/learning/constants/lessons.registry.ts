/**
 * The lessons Rico has been taught, live in this process.
 *
 * Same shape and same reason as professions.registry: the approved examples
 * are rows the owner writes from the dashboard, and an example approved an
 * hour ago has to be in the prompt *now*, on phones already installed — not
 * after the next deploy. ProfessionsService refreshes that registry after
 * every write; LearningService refreshes this one.
 *
 * Unlike professions there is no seed: a fresh install has taught Rico
 * nothing yet, and an empty block simply isn't added to the prompt.
 */

export interface LearnedExample {
  /** The customer phrasing, verbatim. */
  message: string;
  /** 'any', 'saudi' or 'jordanian' — which prompt this belongs in. */
  dialect: string;
  /** The classifier output this phrasing should produce. */
  intents: Record<string, unknown>[];
  /** For a message that should be answered rather than searched. */
  reply: string | null;
}

/** Ceilings on what reaches the prompt. The classifier's system prompt is
 * already long and every message pays for all of it, so a dashboard that
 * accumulates examples for a year must not quietly double the bill — or push
 * the real rules out of the model's attention. Newest examples win, because
 * they are the ones answering what people are asking now. */
export const MAX_PROMPT_EXAMPLES = 40;
export const MAX_PROMPT_CHARS = 6000;

class LessonRegistry {
  private examples: LearnedExample[] = [];

  /** Bumped on every replace, so the built prompt block can be memoized
   * against it rather than rebuilt for every message. */
  version = 0;

  replaceAll(rows: LearnedExample[]): void {
    this.examples = rows.slice(0, MAX_PROMPT_EXAMPLES);
    this.version++;
  }

  all(): LearnedExample[] {
    return this.examples;
  }

  forDialect(dialect: string): LearnedExample[] {
    return this.examples.filter((e) => e.dialect === 'any' || e.dialect === dialect);
  }
}

export const lessonRegistry = new LessonRegistry();

function exampleLine(example: LearnedExample): string {
  const output = example.intents.length
    ? JSON.stringify({ offTopic: false, reply: null, intents: example.intents })
    : JSON.stringify({ offTopic: true, reply: example.reply ?? '', intents: [] });
  // The message is folded onto one line: a newline inside it would look like
  // the start of the next example to the model.
  return `- "${example.message.replace(/\s+/g, ' ').trim()}" ← ${output}`;
}

const blockCache = new Map<string, { version: number; block: string }>();

/**
 * كتلة الأمثلة المتعلَّمة بلهجة العلامة، أو نص فارغ إذا ما في ولا مثال.
 *
 * تُبنى عند الطلب لا عند الاستيراد — نفس سبب professionPromptLines: القائمة
 * تتغيّر والعملية شغّالة، وبرومبت متجمّد عند الإقلاع يظل أعمى عن درس
 * وافق عليه المالك قبل ساعة. ومحفوظة بالذاكرة حسب version فتُبنى مرة لكل
 * تعديل، لا مرة لكل رسالة.
 */
export function learnedExamplesBlock(dialect: string): string {
  const cached = blockCache.get(dialect);
  if (cached && cached.version === lessonRegistry.version) return cached.block;

  const lines: string[] = [];
  let chars = 0;
  for (const example of lessonRegistry.forDialect(dialect)) {
    const line = exampleLine(example);
    if (chars + line.length > MAX_PROMPT_CHARS) break;
    lines.push(line);
    chars += line.length;
  }

  const block = lines.length
    ? `\n\n# أمثلة متعلَّمة من أسئلة حقيقية\n\nهاي رسائل وصلت من مستخدمين فعليين، ومعها الناتج الصحيح لكل وحدة — اتعلّمها وطبّقها على الصياغات القريبة منها كمان، لا على النص الحرفي بس. إذا تعارض مثال منها مع تخمينك، اتبع المثال:\n${lines.join('\n')}`
    : '';

  blockCache.set(dialect, { version: lessonRegistry.version, block });
  return block;
}
