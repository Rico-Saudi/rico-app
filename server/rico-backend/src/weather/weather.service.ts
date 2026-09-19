import { Injectable } from '@nestjs/common';
import {
  OPENWEATHER_URL,
  WeatherSnapshot,
  bucketFor,
  describeAr,
  isNotable,
} from './weather.constants';

/// Rounding applied to coordinates before they become a cache key. 0.1° is
/// roughly 11km — everyone in the same part of a city shares one entry, so
/// call volume tracks *cities being asked about*, not users asking. A whole
/// day of Riyadh traffic is a few dozen calls against a 1M/month allowance.
const GRID_DEGREES = 0.1;

/// Current conditions don't move fast enough to be worth re-fetching sooner,
/// and a stale-by-20-minutes temperature has never changed an answer.
const CACHE_TTL_MS = 20 * 60 * 1000;

/// Weather is decoration: a reply without it is fine, a reply that waited on
/// it is not. Compose has a 5s client timeout behind which the app silently
/// falls back to a fixed template, so this budget has to stay well under it.
const FETCH_TIMEOUT_MS = 1500;

interface CacheEntry {
  value: WeatherSnapshot | null;
  expiresAt: number;
}

/// Current conditions where the user is, for the two things Rico does with
/// them: mentioning the weather when it's worth mentioning, and preferring
/// deals that suit it.
@Injectable()
export class WeatherService {
  private readonly cache = new Map<string, CacheEntry>();

  /// Returns null whenever weather is unavailable — no key configured, the
  /// API is down, the request timed out. Every caller treats null as "carry
  /// on without weather", so an outage at OpenWeather can never cost a user
  /// their search results.
  async getFor(lat: number, lng: number, now: Date = new Date()): Promise<WeatherSnapshot | null> {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) return null;

    const key = this.cacheKey(lat, lng);
    const cached = this.cache.get(key);
    // A cached null counts: if the API just failed, hammering it once per
    // search makes an outage worse rather than better.
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const snapshot = await this.fetchSnapshot(lat, lng, apiKey, now);
    this.cache.set(key, { value: snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
    return snapshot;
  }

  private async fetchSnapshot(
    lat: number,
    lng: number,
    apiKey: string,
    now: Date,
  ): Promise<WeatherSnapshot | null> {
    const url = `${OPENWEATHER_URL}?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) {
        console.warn(`[weather] ${response.status} from OpenWeather`);
        return null;
      }

      const data = await response.json();
      const tempC = data?.main?.temp;
      const condition = data?.weather?.[0]?.main;
      if (typeof tempC !== 'number' || typeof condition !== 'string') return null;

      const bucket = bucketFor(tempC, condition);
      return {
        tempC,
        condition: condition.toLowerCase(),
        bucket,
        notable: isNotable(bucket, tempC, now),
        descriptionAr: describeAr(bucket, tempC),
      };
    } catch {
      // Timeout or network failure. Silent by design — see the class comment.
      return null;
    }
  }

  /// Coordinates collapsed onto a ~0.1° grid.
  ///
  /// toFixed does the rounding directly, because dividing by 0.1 first
  /// introduces binary artifacts — 46.65 / 0.1 is 466.4999…, which rounds
  /// into the neighbouring cell instead of its own.
  ///
  /// Two points a few hundred metres apart can still land in different cells
  /// when a boundary runs between them. That costs one extra API call out of
  /// a million-a-month allowance, which is cheaper than any scheme for
  /// avoiding it.
  private cacheKey(lat: number, lng: number): string {
    const places = Math.round(-Math.log10(GRID_DEGREES));
    return `${lat.toFixed(places)},${lng.toFixed(places)}`;
  }
}
