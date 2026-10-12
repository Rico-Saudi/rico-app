// Pure helpers for web offers: where the customer is, in words Google
// understands, and what a shopping row's price string means as a number.

import { haversineMeters } from '../common/utils/geo.util';

interface City {
  name: string;
  lat: number;
  lng: number;
}

// Big enough cities that a shop's "عروض الرياض" page names them. A customer
// further than CITY_RADIUS from all of them gets the country instead — a
// wrong city is worse than none.
const CITIES: City[] = [
  { name: 'الرياض', lat: 24.7136, lng: 46.6753 },
  { name: 'جدة', lat: 21.5433, lng: 39.1728 },
  { name: 'مكة', lat: 21.3891, lng: 39.8579 },
  { name: 'المدينة المنورة', lat: 24.5247, lng: 39.5692 },
  { name: 'الدمام', lat: 26.4207, lng: 50.0888 },
  { name: 'الخبر', lat: 26.2172, lng: 50.1971 },
  { name: 'الأحساء', lat: 25.3833, lng: 49.5864 },
  { name: 'الجبيل', lat: 27.0046, lng: 49.646 },
  { name: 'الطائف', lat: 21.2703, lng: 40.4158 },
  { name: 'تبوك', lat: 28.3835, lng: 36.5662 },
  { name: 'بريدة', lat: 26.326, lng: 43.975 },
  { name: 'حائل', lat: 27.5114, lng: 41.7208 },
  { name: 'أبها', lat: 18.2164, lng: 42.5053 },
  { name: 'خميس مشيط', lat: 18.3, lng: 42.7333 },
  { name: 'جازان', lat: 16.8892, lng: 42.5511 },
  { name: 'نجران', lat: 17.4924, lng: 44.1277 },
  { name: 'ينبع', lat: 24.0895, lng: 38.0618 },
  { name: 'عمّان', lat: 31.9539, lng: 35.9106 },
  { name: 'الزرقاء', lat: 32.0728, lng: 36.088 },
  { name: 'إربد', lat: 32.5556, lng: 35.85 },
  { name: 'العقبة', lat: 29.532, lng: 35.0063 },
  { name: 'السلط', lat: 32.0392, lng: 35.7272 },
  { name: 'مادبا', lat: 31.7167, lng: 35.8 },
  { name: 'الكرك', lat: 31.1853, lng: 35.7048 },
  { name: 'المفرق', lat: 32.3429, lng: 36.208 },
];

const CITY_RADIUS_METERS = 40_000;

/** The nearest big city, or null when the customer is far from all of them. */
export function nearestCity(lat: number, lng: number): string | null {
  let best: { name: string; d: number } | null = null;
  for (const c of CITIES) {
    const d = haversineMeters(lat, lng, c.lat, c.lng);
    if (!best || d < best.d) best = { name: c.name, d };
  }
  return best && best.d <= CITY_RADIUS_METERS ? best.name : null;
}

export interface ParsedPrice {
  amount: number;
  currency: string | null;
}

/**
 * "SAR 12.50", "12٫50 ر.س.", "١٬٢٥٠ ر.س", "JOD 3.250", "3.25 د.أ" → a number
 * and, when the string says so, its currency. Null when there is no number —
 * a row without a price can't be compared, and guessing one is lying.
 */
export function parsePrice(raw: string | undefined): ParsedPrice | null {
  if (!raw) return null;
  const text = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .replace(/[٬,](?=\d{3}(?!\d))/g, '');
  const match = text.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currency = /SAR|ر\.?\s?س|ريال/i.test(raw)
    ? 'SAR'
    : /JOD|د\.?\s?أ|دينار/i.test(raw)
      ? 'JOD'
      : /USD|\$/i.test(raw)
        ? 'USD'
        : null;
  return { amount, currency };
}

/** "https://www.panda.com.sa/offers" → "panda.com.sa". */
export function domainOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Only plain web links reach the app — a result is third-party text, and a
 * "javascript:" or "intent:" link in it must never become a button. */
export function isWebLink(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

const ARABIC_MONTHS: Record<string, number> = {
  يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, أبريل: 4, إبريل: 4, مايو: 5, يونيو: 6, يوليو: 7, اغسطس: 8, أغسطس: 8,
  سبتمبر: 9, اكتوبر: 10, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

/**
 * Whether an end date, as a page wrote it, is already behind us: "12-10-2026",
 * "12/10/2026", "30 سبتمبر", "7 أكتوبر 2026". A date it can't read is not
 * ended — an offer is never hidden on a guess.
 *
 * A day and month with no year is read as this year; one that would land
 * more than a month ahead is last year's ("30 ديسمبر" read in January).
 */
export function hasEnded(raw: string | null | undefined, today: Date): boolean {
  if (!raw) return false;
  const text = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const numeric = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (numeric) {
    const [, d, m, y] = numeric.map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    return Date.UTC(y, m - 1, d) < startOfToday;
  }

  const named = text.match(/(\d{1,2})\s*([\u0600-\u06FF]+)(?:\s*(\d{4}))?/);
  if (named && ARABIC_MONTHS[named[2]]) {
    const d = Number(named[1]);
    const m = ARABIC_MONTHS[named[2]];
    let y = named[3] ? Number(named[3]) : today.getUTCFullYear();
    if (!named[3] && Date.UTC(y, m - 1, d) > startOfToday + 31 * 86_400_000) y -= 1;
    return Date.UTC(y, m - 1, d) < startOfToday;
  }
  return false;
}
