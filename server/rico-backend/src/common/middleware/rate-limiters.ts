import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { Request } from 'express';

// Keys a limiter by the request's target email rather than its source IP.
// Hashed so the limiter's in-memory keyspace never holds raw addresses.
function emailKey(req: Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return crypto.createHash('sha256').update(email).digest('hex');
}

// Two independent caps on a login: by IP (catches broad abuse) and by the
// target email (catches someone repeatedly hitting one address — harassment
// vector, not just a cost concern). `app.set('trust proxy', 1)` in main.ts
// makes req.ip reflect the real client IP behind Render's proxy.
export const loginIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailKey,
});

// Public write endpoint with no auth — cap abuse without adding real
// friction for a legitimate one-off submission.
export const submitDealLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });

// Fires once per chat response (batched, up to 20 businessIds per call), so
// a normal browsing session legitimately makes many more calls than a
// one-off form submission — capped generously, just enough to blunt abuse.
export const impressionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });

// The only unauthenticated endpoint that spends money per call (Groq
// speech-to-text), so it gets the tightest public cap. A real voice user
// sends a handful of clips per session; 40 per 15 minutes is far past
// normal use and still cheap if someone burns the whole window.
export const transcribeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40 });

// The app's own auth (customer accounts) gets its own IP cap rather than
// reusing loginIpLimiter: a rate-limit instance is one shared counter, so
// hanging the app off the dashboards' limiter would let phone traffic lock
// staff out of the dashboard (and vice versa). It's also looser, because
// mobile users sit behind carrier NAT — many real people can share one IP,
// while a dashboard login is one person at a desk.
export const customerIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Credential checks get a higher per-address ceiling than the dashboards' 5/hour because a customer
// mistyping a password on a phone keyboard is routine, while the codes and
// passwords behind it are still rate-limited server-side by OTP attempt caps.
export const customerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailKey,
});

// Anything that causes an email to be SENT — tighter, because each call
// costs a real message to someone's inbox and the abuse case (mailbombing
// an address you don't own) needs only the address, not an account.
export const customerOtpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailKey,
});

// Sending a lead to a tradesperson emails them and shows up in their inbox,
// so it's capped per IP like the other endpoints that reach a real person.
// Looser than the OTP caps because a customer legitimately messages several
// professionals while comparing, and tighter than impressions because each
// call costs someone's attention rather than a row in a table.
export const professionalRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Attaching a CV or a profile photo writes megabytes into Mongo per call. It
// needs a verified account, so the risk is cost rather than abuse — capped
// well above the handful of attempts someone makes while getting the photo
// of their certificate, or of themselves, straight.
export const fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
