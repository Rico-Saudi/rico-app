/// Current conditions, reduced to the few buckets Rico can actually act on.
///
/// Raw temperature is the wrong unit for a recommendation: 41° means nothing
/// to the reply writer, "it's hot enough that a cold drink and a roof sound
/// good" does. Everything downstream keys off the bucket, never the number.

/// The single source of truth for bucket names — the type below is derived
/// from it so a new bucket can't be added without the DTO validation and the
/// dashboard picker seeing it too.
export const WEATHER_BUCKETS = ['hot', 'cold', 'rain', 'sandstorm', 'pleasant', 'mild'] as const;

export type WeatherBucket = (typeof WEATHER_BUCKETS)[number];

export interface WeatherSnapshot {
  tempC: number;
  /// OpenWeather's own condition group, lowercased ('clear', 'rain', ...).
  condition: string;
  bucket: WeatherBucket;
  /// Whether this is worth saying out loud. See isNotable — in Riyadh "it's
  /// hot" is true most of the year, and a assistant that says it every time
  /// is one users learn to skim past.
  notable: boolean;
  /// A short Arabic phrase for the reply prompt. Built here rather than by
  /// the model so it can't drift into inventing a forecast.
  descriptionAr: string;
}

export const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';

/// The classic Current Weather endpoint is free at 60 calls/min and 1M/month
/// with no card. One Call 3.0 is a separate metered product — we deliberately
/// don't use it; current conditions are all any of this needs.
export const OPENWEATHER_PROVIDER = 'openweather';

const HOT_C = 38;
const EXTREME_HOT_C = 45;
const COLD_C = 15;
const PLEASANT_MIN_C = 18;
const PLEASANT_MAX_C = 30;

/// OpenWeather condition groups that mean water falling out of the sky.
const WET = ['rain', 'drizzle', 'thunderstorm', 'snow'];
/// ...and the ones that mean the air itself is the problem.
const DUSTY = ['sand', 'dust', 'ash', 'squall', 'tornado', 'smoke', 'haze'];

/// Months where heat is the default in this region, so a mild evening is the
/// surprise rather than the heat. Used only by isNotable.
const HOT_SEASON_MONTHS = [4, 5, 6, 7, 8, 9]; // May–October, 0-indexed

export function bucketFor(tempC: number, condition: string): WeatherBucket {
  const c = condition.toLowerCase();
  if (WET.includes(c)) return 'rain';
  if (DUSTY.includes(c)) return 'sandstorm';
  if (tempC >= HOT_C) return 'hot';
  if (tempC <= COLD_C) return 'cold';
  if (tempC >= PLEASANT_MIN_C && tempC <= PLEASANT_MAX_C) return 'pleasant';
  return 'mild';
}

/// Is this weather worth a sentence?
///
/// A deliberately conservative heuristic, not a forecast model: we have no
/// historical baseline to compare against, so "unusual" is approximated by
/// what is unusual *for the Gulf*. Rain, dust and cold are always worth
/// saying; heat only once it's extreme; a pleasant day only when it
/// interrupts the hot season. Mild weather is never news.
export function isNotable(bucket: WeatherBucket, tempC: number, now: Date): boolean {
  switch (bucket) {
    case 'rain':
    case 'sandstorm':
      return true;
    case 'cold':
      // Genuinely unusual in this region, at any depth below the threshold.
      return true;
    case 'hot':
      return tempC >= EXTREME_HOT_C;
    case 'pleasant':
      return HOT_SEASON_MONTHS.includes(now.getUTCMonth());
    case 'mild':
      return false;
  }
}

export function describeAr(bucket: WeatherBucket, tempC: number): string {
  const t = Math.round(tempC);
  switch (bucket) {
    case 'rain':
      return `الجو ماطر و${t}°`;
    case 'sandstorm':
      return `الجو مغبّر و${t}°`;
    case 'hot':
      return `الجو حار، ${t}°`;
    case 'cold':
      return `الجو بارد، ${t}°`;
    case 'pleasant':
      return `الجو معتدل وحلو، ${t}°`;
    case 'mild':
      return `${t}°`;
  }
}

/// Which place categories suit which weather.
///
/// Category-level on purpose: Rico already knows every business's
/// categorySlug, so this needs nothing from vendors. Per-deal targeting is a
/// separate, opt-in thing (Deal.weatherConditions).
export const CATEGORY_AFFINITY: Record<WeatherBucket, string[]> = {
  // Something cold, or somewhere with a roof and air conditioning.
  hot: ['cafe', 'sweets', 'supermarket', 'mall'],
  // Something warm to eat or drink.
  cold: ['cafe', 'restaurant', 'bakery'],
  // Indoors, and somewhere you'd already be heading anyway.
  rain: ['mall', 'cafe', 'restaurant', 'supermarket'],
  // Indoors and necessities — plus the one errand dust actually creates.
  sandstorm: ['mall', 'supermarket', 'pharmacy', 'car_wash'],
  // The rare day worth being outside for.
  pleasant: ['park', 'restaurant', 'cafe'],
  mild: [],
};

/// How much a weather-matching deal is favoured, as a multiplier on its
/// distance when ordering. A nudge, not an override: at 0.7 a matching deal
/// beats a non-matching one only while it's less than ~43% further away, so
/// the nearest useful thing still wins and nobody is sent across town for a
/// juice because it happens to be warm.
export const WEATHER_AFFINITY_FACTOR = 0.7;
