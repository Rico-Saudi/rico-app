// Google results through Serper (serper.dev) — the one place Rico reads the
// open web for offers and prices. Two endpoints: /search for "what offers are
// on" (pages, flyers, announcements) and /shopping for "how much is X" (Google
// Shopping rows with a price on each).
//
// One call is one credit whichever endpoint, as long as num stays at 10 or
// under; past 10 Serper bills double, and ten is already more than a chat
// card shows.

const SERPER_URL = 'https://google.serper.dev';
const TIMEOUT_MS = 6000;

export interface SerperOrganic {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  imageUrl?: string;
}

export interface SerperShopping {
  title?: string;
  source?: string;
  link?: string;
  price?: string;
  delivery?: string;
  imageUrl?: string;
}

export class SerperUnavailable extends Error {}

async function call<T>(path: 'search' | 'shopping', body: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new SerperUnavailable('SERPER_API_KEY is not set');

  let response: Response;
  try {
    response = await fetch(`${SERPER_URL}/${path}`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, num: 10 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new SerperUnavailable(`unreachable: ${(e as Error).message}`);
  }
  if (!response.ok) throw new SerperUnavailable(`status ${response.status}`);
  return (await response.json()) as T;
}

/** [tbs] narrows by date, Google's way: 'qdr:m' is the past month — last
 * Ramadan's flyer still ranks for "عروض", and it's no offer today. */
export async function serperSearch(q: string, gl: string, tbs?: string): Promise<SerperOrganic[]> {
  const data = await call<{ organic?: SerperOrganic[] }>('search', { q, gl, hl: 'ar', ...(tbs ? { tbs } : {}) });
  return Array.isArray(data.organic) ? data.organic : [];
}

export async function serperShopping(q: string, gl: string): Promise<SerperShopping[]> {
  const data = await call<{ shopping?: SerperShopping[] }>('shopping', { q, gl, hl: 'ar' });
  return Array.isArray(data.shopping) ? data.shopping : [];
}
