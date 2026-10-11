import { WeatherService } from './weather.service';
import { CATEGORY_AFFINITY, bucketFor, isNotable } from './weather.constants';

// The judgment in this feature lives in two pure functions — which bucket a
// reading falls into, and whether that bucket is worth saying out loud. Both
// are cheap to get subtly wrong and expensive to notice in production.
describe('weather buckets', () => {
  it('treats anything falling from the sky as rain, whatever the temperature', () => {
    expect(bucketFor(41, 'Rain')).toBe('rain');
    expect(bucketFor(8, 'Drizzle')).toBe('rain');
    expect(bucketFor(25, 'Thunderstorm')).toBe('rain');
  });

  it('treats dust in the air as its own thing, not as clear weather', () => {
    // A 40° dust storm is not a "hot day" — the advice it implies is different.
    expect(bucketFor(40, 'Dust')).toBe('sandstorm');
    expect(bucketFor(33, 'Sand')).toBe('sandstorm');
  });

  it('sorts plain temperatures into hot, cold, pleasant and mild', () => {
    expect(bucketFor(44, 'Clear')).toBe('hot');
    expect(bucketFor(9, 'Clear')).toBe('cold');
    expect(bucketFor(24, 'Clear')).toBe('pleasant');
    expect(bucketFor(34, 'Clear')).toBe('mild');
  });
});

describe('whether weather is worth mentioning', () => {
  const august = new Date('2026-08-15T12:00:00Z');
  const january = new Date('2026-01-15T12:00:00Z');

  it('stays quiet about ordinary heat', () => {
    // The whole point of the gate: in Riyadh "it's hot" is true most of the
    // year, so saying it every time is noise users learn to skip.
    expect(isNotable('hot', 40, august)).toBe(false);
  });

  it('speaks up when the heat is extreme', () => {
    expect(isNotable('hot', 46, august)).toBe(true);
  });

  it('always mentions rain, dust and cold, which are the unusual ones here', () => {
    expect(isNotable('rain', 22, january)).toBe(true);
    expect(isNotable('sandstorm', 35, august)).toBe(true);
    expect(isNotable('cold', 12, january)).toBe(true);
  });

  it('mentions a pleasant day only when it interrupts the hot season', () => {
    // Worth pointing out in August; unremarkable in January.
    expect(isNotable('pleasant', 26, august)).toBe(true);
    expect(isNotable('pleasant', 26, january)).toBe(false);
  });

  it('never mentions mild weather', () => {
    expect(isNotable('mild', 33, august)).toBe(false);
    expect(isNotable('mild', 33, january)).toBe(false);
  });
});

describe('category affinity', () => {
  it('suggests somewhere cold or indoors when it is hot', () => {
    expect(CATEGORY_AFFINITY.hot).toContain('cafe');
    expect(CATEGORY_AFFINITY.hot).toContain('mall');
  });

  it('keeps people indoors when it rains', () => {
    expect(CATEGORY_AFFINITY.rain).toContain('mall');
    expect(CATEGORY_AFFINITY.rain).not.toContain('park');
  });

  it('only suggests a park when the weather is actually good for one', () => {
    expect(CATEGORY_AFFINITY.pleasant).toContain('park');
    expect(CATEGORY_AFFINITY.hot).not.toContain('park');
    expect(CATEGORY_AFFINITY.sandstorm).not.toContain('park');
  });

  it('leaves mild weather with no opinion at all', () => {
    expect(CATEGORY_AFFINITY.mild).toEqual([]);
  });
});

describe('WeatherService', () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV, OPENWEATHER_API_KEY: 'k' };
  });

  afterAll(() => {
    process.env = ENV;
  });

  const reading = (temp: number, main: string) => ({
    ok: true,
    json: async () => ({ main: { temp }, weather: [{ main }] }),
  });

  it('does nothing at all when no key is configured', async () => {
    delete process.env.OPENWEATHER_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    expect(await new WeatherService().getFor(24.7, 46.6)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves everyone in the same grid cell from one call', async () => {
    // Call volume should track areas being asked about, not users asking.
    // Points on opposite sides of a cell boundary do fetch separately —
    // that's inherent to a grid, and one extra call against a million-a-month
    // allowance is not worth engineering away.
    const fetchMock = jest.fn().mockResolvedValue(reading(44, 'Clear'));
    global.fetch = fetchMock as any;
    const service = new WeatherService();

    await service.getFor(24.71, 46.61);
    await service.getFor(24.73, 46.63);
    await service.getFor(24.74, 46.64);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches separately for genuinely different cities', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reading(44, 'Clear'));
    global.fetch = fetchMock as any;
    const service = new WeatherService();

    await service.getFor(24.7, 46.6); // Riyadh
    await service.getFor(21.5, 39.2); // Jeddah

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null rather than throwing when the API fails', async () => {
    // Weather is decoration; a search must never fail because of it.
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;
    expect(await new WeatherService().getFor(24.7, 46.6)).toBeNull();

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as any;
    expect(await new WeatherService().getFor(25.7, 47.6)).toBeNull();
  });

  it('caches a failure too, so an outage is not amplified', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    global.fetch = fetchMock as any;
    const service = new WeatherService();

    await service.getFor(24.7, 46.6);
    await service.getFor(24.7, 46.6);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries the bucket and the notability verdict through', async () => {
    global.fetch = jest.fn().mockResolvedValue(reading(46, 'Clear')) as any;
    const snapshot = await new WeatherService().getFor(24.7, 46.6);

    expect(snapshot).toMatchObject({ tempC: 46, condition: 'clear', bucket: 'hot', notable: true });
    expect(snapshot!.descriptionAr).toContain('46');
  });
});
