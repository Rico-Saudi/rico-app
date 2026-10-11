import { GRAPH_URL, MEDIA_PAGE_SIZE, SCOPES, TOKEN_URL, AUTHORIZE_URL } from './instagram.constants';

/// Thin wrapper over the three Meta calls this feature needs. No retries and
/// no cleverness: every caller treats a failure as "the link is unhealthy,
/// tell the vendor", which is more useful than a silent recovery that leaves
/// them wondering why nothing imports.

export interface InstagramMedia {
  id: string;
  caption: string | null;
  permalink: string;
  mediaUrl: string | null;
  timestamp: string;
}

function configOrThrow(): { appId: string; appSecret: string; redirectUri: string } {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) throw new Error('instagram_not_configured');
  return { appId, appSecret, redirectUri };
}

export function isConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET && process.env.INSTAGRAM_REDIRECT_URI);
}

/// Where the vendor goes to approve. `state` binds the round trip to their
/// session — see InstagramService.
export function authorizeUrl(state: string): string {
  const { appId, redirectUri } = configOrThrow();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

/// Authorisation code -> short-lived token (one hour) plus the account id.
export async function exchangeCode(code: string): Promise<{ accessToken: string; igUserId: string }> {
  const { appId, appSecret, redirectUri } = configOrThrow();

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) throw new Error(`instagram_code_exchange_failed:${response.status}`);
  const data = await response.json();
  if (!data?.access_token || !data?.user_id) throw new Error('instagram_code_exchange_malformed');
  return { accessToken: data.access_token, igUserId: String(data.user_id) };
}

/// Short-lived token -> 60-day token. Called immediately after the exchange:
/// a one-hour token is useless for a nightly import.
export async function exchangeForLongLived(shortToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const { appSecret } = configOrThrow();
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: shortToken,
  });

  const response = await fetch(`${GRAPH_URL}/access_token?${params}`);
  if (!response.ok) throw new Error(`instagram_long_lived_failed:${response.status}`);
  const data = await response.json();
  if (!data?.access_token) throw new Error('instagram_long_lived_malformed');
  return { accessToken: data.access_token, expiresInSeconds: Number(data.expires_in) || 60 * 24 * 60 * 60 };
}

/// Extends a still-valid long-lived token for another 60 days.
export async function refreshLongLived(token: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
  const response = await fetch(`${GRAPH_URL}/refresh_access_token?${params}`);
  if (!response.ok) throw new Error(`instagram_refresh_failed:${response.status}`);
  const data = await response.json();
  if (!data?.access_token) throw new Error('instagram_refresh_malformed');
  return { accessToken: data.access_token, expiresInSeconds: Number(data.expires_in) || 60 * 24 * 60 * 60 };
}

export async function fetchProfile(token: string): Promise<{ username: string }> {
  const response = await fetch(`${GRAPH_URL}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
  if (!response.ok) throw new Error(`instagram_profile_failed:${response.status}`);
  const data = await response.json();
  return { username: data?.username ?? 'unknown' };
}

/// The vendor's own recent posts, captions included — the whole reason this
/// route exists rather than the scraping one.
export async function fetchMedia(token: string): Promise<InstagramMedia[]> {
  const params = new URLSearchParams({
    fields: 'id,caption,permalink,media_url,timestamp',
    limit: String(MEDIA_PAGE_SIZE),
    access_token: token,
  });

  const response = await fetch(`${GRAPH_URL}/me/media?${params}`);
  if (!response.ok) throw new Error(`instagram_media_failed:${response.status}`);
  const data = await response.json();

  return ((data?.data as any[]) ?? []).map((m) => ({
    id: String(m.id),
    caption: typeof m.caption === 'string' ? m.caption : null,
    permalink: String(m.permalink ?? ''),
    mediaUrl: typeof m.media_url === 'string' ? m.media_url : null,
    timestamp: String(m.timestamp ?? ''),
  }));
}
