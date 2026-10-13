import { createPrivateKey, generateKeyPairSync, KeyObject, sign } from 'crypto';

/// A VAPID key pair: the public half goes to the browser when it subscribes
/// (as the 65-byte uncompressed P-256 point, base64url), the private half
/// signs the JWT on every push so the push service knows the sender.
export interface VapidKeys {
  publicKey: string;
  privateJwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string; d: string };
}

export function generateVapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' }) as VapidKeys['privateJwk'];
  return { publicKey: publicKeyFromJwk(jwk), privateJwk: jwk };
}

export function publicKeyFromJwk(jwk: { x: string; y: string }): string {
  const point = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return point.toString('base64url');
}

/// The Authorization header for one push to [endpoint]: `vapid t=<jwt>, k=<key>`.
/// The JWT's audience is the push service's origin, valid for 12 hours (the
/// spec's ceiling is 24).
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64json({ typ: 'JWT', alg: 'ES256' });
  const claims = b64json({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject });
  const unsigned = `${header}.${claims}`;
  const key: KeyObject = createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  // ES256 wants the raw r||s form, not DER.
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${signature.toString('base64url')}, k=${keys.publicKey}`;
}

function b64json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/// Push services a browser may hand us. Anything else is refused at
/// subscribe time: the server POSTs to this URL later, so an arbitrary one
/// would let a vendor make the server call into its own network.
const PUSH_HOSTS = [/\.?fcm\.googleapis\.com$/, /\.?android\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}
