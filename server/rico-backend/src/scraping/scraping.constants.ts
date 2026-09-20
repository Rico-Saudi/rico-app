/// Pulling published offers off retailer sites, through ScraperAPI.
///
/// Read this before changing anything here. Offers collected this way are not
/// the same kind of fact as the rest of Rico's data, and the constants below
/// exist to keep that difference visible rather than to tune throughput:
///
/// - They are never vendor-confirmed. Nobody at the shop agreed to show them,
///   so the app labels them and never lets one outrank a vendor's own deal.
/// - They go stale fast. A supermarket rotates weekly offers and takes the old
///   page down; ours would linger, so every scraped deal carries a hard
///   expiry and dies on its own.
/// - They are somebody else's content. Each one keeps the URL it came from, so
///   a shop asking where it appeared gets a straight answer.
///
/// The crawler identifies itself, honours robots.txt, and takes what sites
/// publish as structured data for machines before it reads anything else.

export const SCRAPER_PROVIDER = 'scraperapi';

/// ScraperAPI bills credits, not requests: a static page is 1, JavaScript
/// rendering 5–10, and premium proxy with rendering as much as 75. The free
/// grant is 1,000 credits, which is roughly 40 rendered pages — enough to
/// prove the pipeline, nowhere near enough to track a chain. Treat this cap as
/// the thing that stops a loop quietly spending a month's budget in a minute.
export const DEFAULT_SCRAPER_MONTHLY_CREDITS = 1000;

export const CREDIT_COST = {
  plain: 1,
  renderJs: 10,
};

/// How long a scraped offer may live before it removes itself.
///
/// Short on purpose. A wrong price the user drives across town for is blamed
/// on Rico, not on the shop, and an offer nobody re-confirmed is a guess after
/// a few days. Vendor-entered deals have no such limit — a vendor owns their
/// own accuracy.
export const SCRAPED_DEAL_TTL_DAYS = 3;

/// The `source` every scraped deal carries. The app keys its «من موقع المتجر»
/// badge off this, and the ranking uses it to keep scraped deals behind
/// vendor-confirmed ones.
export const SCRAPED_SOURCE = 'scraped';

/// Sent on every request, including the robots.txt fetch. A crawler that will
/// not say who it is has no business asking a site for anything, and a shop
/// that wants to block us must be able to name us to do it.
export const USER_AGENT = 'RicoBot/1.0 (+https://app.rico-go.com/bot)';

/// Politeness gap between two requests to the same host.
export const PER_HOST_DELAY_MS = 2000;

/// Nothing is worth waiting on forever, least of all a page we are optional to.
export const FETCH_TIMEOUT_MS = 30_000;

/// How far a scraped deal is pushed down the ordering, as a multiplier on its
/// distance — the mirror of the weather affinity nudge, pointing the other
/// way.
///
/// A vendor typed their offer and stands behind it; we read somebody else's
/// page and nobody confirmed anything. So a scraped offer has to be markedly
/// closer to appear above a vendor's, and at similar distance the vendor
/// always wins. This is the ranking half of the same honesty the badge states
/// in words.
export const SCRAPED_RANK_PENALTY = 1.5;
