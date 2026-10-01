import { CREDIT_COST, FETCH_TIMEOUT_MS, USER_AGENT } from './scraping.constants';

/// Fetches a page through ScraperAPI.
///
/// ScraperAPI's headline feature is rotating IPs to get past blocks. We do not
/// use it that way: `premium` stays off, robots.txt is checked before anything
/// is requested (see robots.ts), and RicoBot identifies itself in the headers
/// it forwards. What we want from the service is a reliable fetch with
/// optional JavaScript rendering, because Gulf retailer sites are single-page
/// apps whose offers are not in the delivered HTML.
///
/// If a site blocks RicoBot, that is an answer. Turning the block off is a
/// product decision nobody should be able to make by flipping a boolean here,
/// which is why there is no boolean here to flip.

export interface FetchResult {
  html: string;
  /// What this cost, so the caller can hold the monthly budget.
  creditsUsed: number;
}

function apiKeyOrThrow(): string {
  const key = process.env.SCRAPER_API_KEY;
  if (!key) throw new Error('scraper_api_not_configured');
  return key;
}

export function creditCost(renderJs: boolean): number {
  return renderJs ? CREDIT_COST.renderJs : CREDIT_COST.plain;
}

export async function fetchPage(url: string, renderJs: boolean): Promise<FetchResult> {
  const params = new URLSearchParams({
    api_key: apiKeyOrThrow(),
    url,
    // Country matters: a Riyadh store shows different offers to a visitor it
    // thinks is elsewhere, and a wrong-region price is worse than none.
    country_code: process.env.SCRAPER_COUNTRY_CODE || 'sa',
    ...(renderJs ? { render: 'true' } : {}),
  });

  const response = await fetch(`https://api.scraperapi.com/?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`scraper_error:${response.status}:${body.slice(0, 200)}`);
  }

  return { html: await response.text(), creditsUsed: creditCost(renderJs) };
}
