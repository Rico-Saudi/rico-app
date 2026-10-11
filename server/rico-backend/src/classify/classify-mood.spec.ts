import { buildVoiceBlock, describeVoiceForTest, validateMood } from './constants/moods';

// The mood is a delivery instruction the model hands us, so the two places
// it can go wrong are both here: what we accept back from it, and what we
// tell it about how the customer sounded.
describe('customer mood', () => {
  describe('validateMood', () => {
    it('keeps the five known moods', () => {
      for (const mood of ['neutral', 'urgent', 'angry', 'hesitant', 'happy']) {
        expect(validateMood(mood)).toBe(mood);
      }
    });

    // An invented mood must not reach the reply writer: 'furious' would be
    // dropped by compose's @IsIn and 400 a search the customer is waiting on.
    it('falls back to neutral for anything else', () => {
      for (const raw of ['furious', '', null, undefined, 42, {}, ['urgent']]) {
        expect(validateMood(raw)).toBe('neutral');
      }
    });
  });

  describe('describeVoice', () => {
    it('reads fast and loud as such', () => {
      expect(describeVoiceForTest({ durationMs: 5000, wordsPerMinute: 200, loudness: 0.85 })).toEqual([
        'يتكلم بسرعة',
        'صوته عالي',
      ]);
    });

    it('reads slow and quiet as such', () => {
      expect(describeVoiceForTest({ durationMs: 8000, wordsPerMinute: 60, loudness: 0.2 })).toEqual([
        'يتكلم ببطء أو متقطّع',
        'صوته منخفض',
      ]);
    });

    it('calls a normal delivery normal rather than staying silent', () => {
      // Saying "عادي" out loud matters: an absent note reads to the model as
      // missing data, and it starts guessing tone from the words alone.
      expect(describeVoiceForTest({ durationMs: 6000, wordsPerMinute: 130, loudness: 0.5 })).toEqual([
        'يتكلم بسرعة عادية',
        'صوته عادي',
      ]);
    });

    it('flags a very short clip, where speech rate means little', () => {
      expect(describeVoiceForTest({ durationMs: 1500, wordsPerMinute: 120, loudness: 0.5 })).toContain(
        'المقطع قصير جداً',
      );
    });

    it('says nothing when nothing was measured', () => {
      expect(describeVoiceForTest({ durationMs: 0 })).toEqual([]);
      expect(buildVoiceBlock({ durationMs: 0 })).toBe('');
    });
  });

  describe('buildVoiceBlock', () => {
    it('subordinates tone to the words, and forbids reading intent from it', () => {
      const block = buildVoiceBlock({ durationMs: 4000, wordsPerMinute: 190, loudness: 0.8 });
      expect(block).toContain('يتكلم بسرعة');
      expect(block).toContain('الكلمات هي الأساس');
      expect(block).toContain('لا تستنتج منها أي شي عن نوع المكان المطلوب');
    });
  });
});
