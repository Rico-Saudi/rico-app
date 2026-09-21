// Multi-intent LLM classifier constants. The category enums live in
// categories.ts and the prompt text in prompts/<dialect>.prompt.ts; this file
// picks the prompt for the asking brand's dialect.

import { Brand } from '../../common/constants/brands';
import { buildJordanianSystemPrompt, JORDANIAN_CLARIFY_REPLY } from './prompts/jordanian.prompt';
import { buildSaudiSystemPrompt, SAUDI_CLARIFY_REPLY } from './prompts/saudi.prompt';

export { CATEGORIES, MAX_INTENTS, OTHER_TAG_KEYS, RANKS } from './categories';

/** Picks the classifier prompt written in the brand's own dialect. A Saudi
 * build must not be answered in Jordanian just because both share a
 * deployment, which is what a single hardcoded prompt used to do. */
export function buildSystemPrompt(brand: Brand): string {
  return brand.dialect === 'jordanian'
    ? buildJordanianSystemPrompt(brand.name)
    : buildSaudiSystemPrompt(brand.name);
}

/** نص «ما فهمتك، وضّح لي» بلهجة العلامة. يُستخدم حين يرد النموذج بنوايا كلها
 * غير صالحة: انظر ClassifyService.classify. */
export function clarifyReplyFor(brand: Brand): string {
  return brand.dialect === 'jordanian' ? JORDANIAN_CLARIFY_REPLY : SAUDI_CLARIFY_REPLY;
}
