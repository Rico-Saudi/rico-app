/// Pulling a vendor's own offers off their own Instagram, with their consent.
///
/// This is the opposite of the scraping module in every way that matters. The
/// account holder authorises Rico, so we read through Meta's official API and
/// get the captions — which is where an offer actually lives, and precisely
/// what Meta withholds from anyone looking at an account they don't own.
/// Nothing here evades anything; if a vendor disconnects, we stop.
///
/// Uses Instagram API with Instagram Login (not the older Facebook Login
/// route), because it does not require the vendor to have a Facebook Page
/// linked — most small shops in Riyadh and Amman have an Instagram account
/// and nothing else.

export const INSTAGRAM_SOURCE = 'instagram';

/// Where the vendor is sent to approve the connection.
export const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';

/// Short-lived token exchange (one hour).
export const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

/// Everything else, including swapping the short-lived token for a 60-day one.
export const GRAPH_URL = 'https://graph.instagram.com';

/// Read-only. We ask for the least that lets us read a vendor's own posts —
/// no publishing, no messaging, no insights. A permission we never use is a
/// permission that shows up in the vendor's consent screen and makes them
/// hesitate, and one more thing to justify at App Review.
export const SCOPES = ['instagram_business_basic'];

/// Long-lived tokens last 60 days and can be refreshed while still valid.
/// Refreshing at 50 leaves ten days of slack for a vendor whose shop is quiet
/// and whose token would otherwise lapse unnoticed.
export const TOKEN_REFRESH_AFTER_DAYS = 50;

/// How many recent posts an import looks at. Offers are recent by nature, and
/// reading deeper mostly finds last season's.
export const MEDIA_PAGE_SIZE = 25;

/// Captions longer than this are almost never a single offer — they're a
/// story, a menu dump, or a competition. Truncated before the model sees it.
export const MAX_CAPTION_CHARS = 1200;

/// How long an imported offer lives when its caption names no end date.
///
/// Longer than a scraped deal's three days, because a vendor chose to connect
/// this account and stands behind what it posts — but not unlimited, since an
/// Instagram post stays up long after the offer behind it has ended.
export const DEFAULT_OFFER_TTL_DAYS = 14;
