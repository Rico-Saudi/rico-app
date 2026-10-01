import { resolveProfession } from './constants/professions.registry';

// The 106-trade list used to be injected into every classifier prompt so the
// model could pick a slug itself. That pushed the prompt over the account's
// Groq limit and made EVERY classify call fail. The model now echoes the
// Arabic trade the customer said and this resolves it — so what it accepts,
// and what it refuses, is the whole safety of that move.
describe('resolveProfession', () => {
  it('takes the Arabic trade name as customers say it', () => {
    expect(resolveProfession('دهان')).toBe('painter');
    expect(resolveProfession('دهّان')).toBe('painter');
    expect(resolveProfession('كهربائي')).toBe('electrician');
    expect(resolveProfession('سباك')).toBe('plumber');
    expect(resolveProfession('نجار')).toBe('carpenter');
  });

  it('survives the spelling differences normalization exists for', () => {
    // Hamza, taa marbuta and the definite article all vary in real messages.
    expect(resolveProfession('كهربائى')).toBe('electrician');
    expect(resolveProfession('الدهان')).toBe('painter');
  });

  it('still accepts a slug, in case a model answers with one', () => {
    expect(resolveProfession('painter')).toBe('painter');
    expect(resolveProfession('ac_technician')).toBe('ac_technician');
  });

  // Sending a request to the wrong tradesman is far worse than admitting the
  // trade isn't covered, so anything this unsure is refused outright.
  it('refuses what it cannot place', () => {
    expect(resolveProfession('رائد فضاء')).toBeNull();
    expect(resolveProfession('')).toBeNull();
    expect(resolveProfession('   ')).toBeNull();
    expect(resolveProfession(null)).toBeNull();
    expect(resolveProfession(undefined)).toBeNull();
    expect(resolveProfession(42)).toBeNull();
    expect(resolveProfession('x'.repeat(200))).toBeNull();
  });

  // The trades sit close together in name space — this is the failure the
  // threshold exists to prevent.
  it('does not slide between neighbouring trades', () => {
    expect(resolveProfession('نجار')).not.toBe('painter');
    expect(resolveProfession('دهان')).not.toBe('carpenter');
    expect(resolveProfession('حداد')).not.toBe('نجار');
  });

  // `aliases` are how people actually write a trade. They used to serve the
  // offline keyword fallback alone; now the classifier echoes the customer's
  // own word, so an alias is the only route "كهربجي" has to `electrician`.
  it('reads the aliases, not just the catalogue name', () => {
    expect(resolveProfession('كهربجي')).toBe('electrician');
    expect(resolveProfession('فني صحي')).toBe('plumber');
    expect(resolveProfession('مواسير')).toBe('plumber');
  });

  describe('words that mean a different trade per market', () => {
    // Caught live: "بدي سمكري عندي تسريب مي بسرعة" from a Jordanian user
    // resolved to `car_body` — a panel beater sent to a burst pipe. The
    // catalogue is written in Saudi, where سمكري really is the car trade.
    it('reads سمكري as a plumber for a Jordanian brand', () => {
      expect(resolveProfession('سمكري', 'jordanian')).toBe('plumber');
      expect(resolveProfession('سمكرجي', 'jordanian')).toBe('plumber');
    });

    it('keeps the Saudi meaning for a Saudi brand', () => {
      expect(resolveProfession('سمكري', 'saudi')).toBe('car_body');
      expect(resolveProfession('سمكري')).toBe('car_body');
    });

    // The override decides only the colliding word; everything else still
    // goes through ordinary matching in either dialect.
    it('leaves every other trade alone', () => {
      expect(resolveProfession('دهان', 'jordanian')).toBe('painter');
      expect(resolveProfession('كهربائي', 'jordanian')).toBe('electrician');
      expect(resolveProfession('سمكري سيارات', 'jordanian')).toBe('car_body');
    });
  });
});
