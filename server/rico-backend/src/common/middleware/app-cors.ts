import cors from 'cors';

/**
 * CORS for the two public LLM endpoints (/classify, /compose).
 *
 * They were born behind a Cloudflare Worker on its own hostname, so they
 * carried a wide-open `cors()` — any page on the web could spend a Groq call.
 * Nothing needs that any more: the phone app talks to the API natively and
 * sends no Origin header at all, and the dashboards are served by this same
 * process, so they are same-origin. Only a browser page on another host is
 * affected by this list, and CORS_ORIGINS adds one when there is a reason.
 */
const DEFAULT_ORIGINS = ['https://app.rico-go.com'];

const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function allowedOrigins(): string[] {
  const extra = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

/** Whether a browser on `origin` may read an answer from these endpoints. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  // No Origin at all: a native app, a server, or curl. That is not a
  // browser's cross-site request, so there is nothing here for CORS to
  // protect — the rate limiter is what guards these endpoints from abuse.
  if (!origin) return true;
  if (allowedOrigins().includes(origin)) return true;
  return process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(origin);
}

export const appCors = cors({
  // Refused by answering *without* the allow header rather than by raising:
  // an error here would surface as a 500, while a plain answer lets the
  // browser block the read itself, which is what a CORS refusal actually is.
  origin: (origin, done) => done(null, isAllowedOrigin(origin)),
});
