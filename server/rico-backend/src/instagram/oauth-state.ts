import { createHmac, timingSafeEqual } from 'crypto';

/// Binds an OAuth round trip to one vendor account and one business.
///
/// Without it, anyone could hand a vendor a crafted callback URL and have
/// their Instagram attached to a business they do not own. The signature
/// covers both ids together, so a state minted for one pairing cannot be
/// replayed for another, and the session finishing the flow must be the one
/// that started it.
///
/// Pure and dependency-free so it can be tested directly — this is the piece
/// where a subtle mistake is an account takeover rather than a bug.

export class StateError extends Error {}

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-secret';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function signState(accountId: string, businessId: string): string {
  const payload = `${accountId}:${businessId}`;
  return Buffer.from(`${payload}:${sign(payload)}`).toString('base64url');
}

/// Returns the business id the state was minted for, or throws.
export function verifyState(state: string, accountId: string): string {
  let decoded: string;
  try {
    decoded = Buffer.from(state, 'base64url').toString('utf8');
  } catch {
    throw new StateError('bad_state');
  }

  const parts = decoded.split(':');
  if (parts.length !== 3) throw new StateError('bad_state');
  const [stateAccountId, businessId, signature] = parts;
  if (!stateAccountId || !businessId || !signature) throw new StateError('bad_state');

  const expected = sign(`${stateAccountId}:${businessId}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new StateError('bad_signature');

  // Checked after the signature so a forged state fails as a forgery rather
  // than leaking whether the pairing exists.
  if (stateAccountId !== accountId) throw new StateError('state_mismatch');

  return businessId;
}
