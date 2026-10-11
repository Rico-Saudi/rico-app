// Customer mood — read off the same classifier call that reads intent, not a
// second model round-trip: the classifier already has the message, the
// dialect prompt and the conversation history in front of it, so asking it
// for a mood label costs a handful of output tokens and no extra latency.
//
// The mood is a *delivery* instruction, never a search instruction. It
// changes how many results Rico shows and how long he talks; it never
// changes what he searched for. A misread mood must therefore be able to
// make the answer terser or wordier and nothing worse than that.

export const MOODS = ['neutral', 'urgent', 'angry', 'hesitant', 'happy'] as const;

export type Mood = (typeof MOODS)[number];

/** Unknown/absent/invented values all read as 'neutral' — the mood is an
 * optimization, and the neutral path is the behaviour Rico had before it. */
export function validateMood(raw: any): Mood {
  return (MOODS as readonly string[]).includes(raw) ? (raw as Mood) : 'neutral';
}

/** How the customer sounded, as measured from the recording itself. */
export interface VoiceSignals {
  /** Clip length in milliseconds. */
  durationMs: number;
  /** Transcript words ÷ minutes of audio. */
  wordsPerMinute?: number;
  /** Mean recording level, 0 (silence) to 1 (loud), as the app normalizes it. */
  loudness?: number;
}

// Arabic conversational speech sits around 120-150 wpm. Below ~95 reads as
// hesitating or thinking aloud; above ~165 reads as rushing. These are broad
// bands on purpose — the point is to nudge a tie, not to measure anyone.
const SLOW_WPM = 95;
const FAST_WPM = 165;

// The app normalizes dBFS onto 0-1 across the -45..0 band it considers
// useful speech, so 0.7+ is someone genuinely raising their voice rather
// than a quiet room.
const QUIET_LEVEL = 0.35;
const LOUD_LEVEL = 0.7;

/** Turns the measurements into the short Arabic phrases the prompt reasons
 * over. The model is bad at thresholds on raw numbers and good at "يتكلم
 * بسرعة وصوته عالي", so the mapping happens here, once, where it can be
 * tested — not inside the prompt. */
function describeVoice(voice: VoiceSignals): string[] {
  const notes: string[] = [];

  const wpm = voice.wordsPerMinute;
  if (typeof wpm === 'number' && wpm > 0) {
    if (wpm >= FAST_WPM) notes.push('يتكلم بسرعة');
    else if (wpm <= SLOW_WPM) notes.push('يتكلم ببطء أو متقطّع');
    else notes.push('يتكلم بسرعة عادية');
  }

  const loudness = voice.loudness;
  if (typeof loudness === 'number' && loudness > 0) {
    if (loudness >= LOUD_LEVEL) notes.push('صوته عالي');
    else if (loudness <= QUIET_LEVEL) notes.push('صوته منخفض');
    else notes.push('صوته عادي');
  }

  // A one-or-two-word clip is someone barking a need, not chatting. Worth
  // saying out loud because wpm is unreliable on clips this short.
  if (voice.durationMs > 0 && voice.durationMs <= 2000) notes.push('المقطع قصير جداً');

  return notes;
}

/** The block appended to the system prompt when the message came in by
 * voice. Absent for typed messages — there is nothing to measure, and the
 * model must not be told to imagine prosody it was never given. */
export function buildVoiceBlock(voice: VoiceSignals): string {
  const notes = describeVoice(voice);
  if (notes.length === 0) return '';
  return `\n\nهذي الرسالة وصلت **صوتاً** لا كتابة، وهذي ملاحظات على طريقة نطقها: ${notes.join('، ')}. استخدمها كمرجّح لحقل mood بس — الكلمات هي الأساس دايماً، والنبرة تحسم التعادل لا أكثر. لا تستنتج منها أي شي عن نوع المكان المطلوب.`;
}

/** Exposed for tests: the number → phrase mapping is the whole substance of
 * the voice signal, and it deserves coverage without a live model call. */
export const describeVoiceForTest = describeVoice;
