import crypto from 'node:crypto';

// 256-bit random tokens, base64url-encoded (no padding/slashes to worry
// about in URLs). Only the SHA-256 hash is ever stored.
export function generateToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const SCRYPT_KEYLEN = 64;

// scrypt over bcrypt/argon2 to avoid a new native dependency — node:crypto
// already covers everything here. Stored as "<saltHex>:<hashHex>".
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidateBuffer = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  if (hashBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, candidateBuffer);
}

// 6-digit numeric code for the app's email verification / password reset.
// crypto.randomInt (not Math.random) because this is a credential: it has
// to be unguessable, and the 6-digit space is small enough that a biased
// generator would meaningfully shrink it. Zero-padded so every code is
// exactly six characters — "012345" must not be emailed as "12345".
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
