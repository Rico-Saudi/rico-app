// Turns one proposal from a training run into a lesson the owner can be
// shown, or drops it. Split out of TrainingService so it can be tested the
// way validateIntent is — directly, rather than only through a live model
// call — because this is where a hallucinated trade or an invented category
// is supposed to die.

import { Lesson } from '../schemas/lesson.schema';
import { validateIntent } from '../../classify/intent-validation';
import { isKnownProfession, professionRegistry } from '../../professionals/constants/professions.registry';
import { PROFESSION_SLUG_PATTERN } from '../../professionals/dto/upsert-profession.dto';

/** The shape a training run asks the model for. Every field is optional
 * here on purpose: this is untrusted model output, and the validator below
 * is what gives it a shape. */
export interface Proposal {
  gaps: number[];
  kind: 'example' | 'profession' | 'skip';
  message?: string;
  dialect?: string;
  intents?: unknown[];
  reply?: string | null;
  profession?: Record<string, unknown> | null;
  note?: string;
}

/** Turns one model proposal into a lesson document, or null if it isn't
 * one Rico could act on. Same philosophy as validateIntent: drop the bad
 * element, keep the run.
 *
 * `claimedMessages` is the real text of the gaps this proposal points at —
 * what a teaching example is *supposed* to teach. It is passed in because
 * the model cannot be trusted to echo it: the first live run answered with
 * `"message": "example"`, copying the word out of the prompt's JSON template
 * instead of the customer's question, and that string is what would have
 * been planted in the classifier prompt. */
export function validateProposal(proposal: Proposal, claimedMessages: string[] = []): Partial<Lesson> | null {
  const note = typeof proposal?.note === 'string' ? proposal.note.trim().slice(0, 300) : '';
  const dialect = ['any', 'saudi', 'jordanian'].includes(proposal?.dialect ?? '') ? proposal.dialect! : 'any';
  const message = typeof proposal?.message === 'string' ? proposal.message.trim().slice(0, 300) : '';

  if (proposal?.kind === 'skip') {
    // The message is only a label here — the gaps are what matters.
    return { kind: 'skip', message: message || 'خارج نطاق ريكو', dialect, note, intents: [], reply: null };
  }

  if (proposal?.kind === 'profession') {
    const p = proposal.profession;
    const slug = typeof p?.slug === 'string' ? p.slug.trim().toLowerCase() : '';
    const label = typeof p?.label === 'string' ? p.label.trim() : '';
    const group = typeof p?.group === 'string' ? p.group.trim() : '';

    // A slug the registry already knows is not a new trade — proposing it
    // would fail at approval time, after wasting the owner's attention.
    if (!PROFESSION_SLUG_PATTERN.test(slug) || isKnownProfession(slug)) return null;
    if (!label || label.length > 60 || !professionRegistry.hasGroup(group)) return null;

    const aliases = Array.isArray(p?.aliases)
      ? (p!.aliases as unknown[])
          .filter((a): a is string => typeof a === 'string' && a.trim().length > 0 && a.length <= 40)
          .map((a) => a.trim())
          .slice(0, 10)
      : [];

    return {
      kind: 'profession',
      message: message || label,
      dialect,
      note,
      profession: { slug, label, group, aliases },
      intents: [],
      reply: null,
    };
  }

  if (proposal?.kind !== 'example') return null;

  // An example has to teach a phrasing somebody actually used. Anything the
  // model invented is replaced by the real question it claims to answer;
  // only an echo of one of those questions is taken as written.
  const lessonMessage = claimedMessages.includes(message) ? message : (claimedMessages[0] ?? '');
  if (!lessonMessage) return null;

  // The same gate a live model answer passes through, so an approved
  // example can never promise a shape the server would throw away.
  const intents = (Array.isArray(proposal.intents) ? proposal.intents : [])
    .map((i) => validateIntent(i))
    .filter(Boolean) as unknown as Record<string, unknown>[];

  const reply = typeof proposal.reply === 'string' ? proposal.reply.trim().slice(0, 600) : '';

  // An example that neither searches nor answers teaches nothing.
  if (!intents.length && !reply) return null;

  return { kind: 'example', message: lessonMessage, dialect, note, intents, reply: intents.length ? null : reply };
}
