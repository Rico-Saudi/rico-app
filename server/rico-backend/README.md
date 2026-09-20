# rico-backend

NestJS + MongoDB backend for Rico: a local business discovery platform. Combines:

- A product-catalog MVP (`Business` → `Product` → `Discount`) with a rule-based, non-LLM query parser (category/attribute dictionaries + typo-tolerant fuzzy matching).
- Everything the previous Express backend already had: geo search (`/search`) and nearby deals (`/deals`) with response shapes kept **byte-identical** to the old `rico-api`/`groq-proxy` Cloudflare Workers so the Flutter app only needs its base URLs updated — plus a vendor self-serve dashboard (email+password login, products/discounts/deals), place claims with owner moderation, and a platform-owner dashboard (business oversight, deal/claim moderation, Google Places sync, analytics, staff, audit log).
- A single unified `Account` model (`app: 'owner'|'vendor'`) backing one `/auth/*` login surface for both dashboards — no separate admin token or magic-link flow.
- App-customer accounts (`/customer/auth/*`): name + email + password + phone, email proven by a 6-digit code sent with Resend, and a bearer-token session for the Flutter app. Confirming an order in chat (`POST /requests`) now attaches the customer behind it.
- A multi-intent Arabic classifier (`/classify`) backed by Groq, ported from `groq-proxy`.

## Requirements

- Node.js 20+
- A MongoDB connection string (Atlas or local)

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Var | Required | Notes |
|---|---|---|
| `MONGODB_URI` | yes | Mongo connection string |
| `NODE_ENV` | no | `production` enables secure session cookies |
| `PORT` | no | default `3000` |
| `SESSION_SECRET` | yes (prod) | signs the owner/vendor dashboard session cookie |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | no | seeds the first `/owner/dashboard` login on first boot only (no-op if an owner account already exists); defaults to `owner@rico.app` / `ChangeMe123!` if unset — change these before a real deploy |
| `GOOGLE_PLACES_API_KEY` | only for `/owner/sourcing/sync-google` | Google Places API (New) key |
| `GOOGLE_PLACES_MONTHLY_CAP` | no | default `200` |
| `GOOGLE_SYNC_COOLDOWN_DAYS` | no | default `30` |
| `GOOGLE_PHOTOS_MONTHLY_CAP` | no | default `1000` — separate budget for `GET /places/:id/photo`, which bills as the Place Photos SKU ($7/1,000, first 1,000/month free) rather than against the search cap |
| `GROQ_API_KEY` | only for `/classify` | Groq Cloud API key |
| `GROQ_MODEL` | no | default `openai/gpt-oss-120b` |
| `LLM_PROVIDER` | no | `groq` (default) or `openrouter`. Unset keeps the exact behaviour this app shipped with — a provider swap is a config change, not a release |
| `OPENROUTER_API_KEY` | only for `LLM_PROVIDER=openrouter` | one key for many models |
| `OPENROUTER_CLASSIFY_MODELS` | no | comma-separated chain, priority order; OpenRouter fails over down it inside one request and bills whichever answered |
| `OPENROUTER_COMPOSE_MODELS` | no | as above, separately — classification wants reasoning, composition wants speed |
| `OPENROUTER_MODEL` | no | fallback when neither per-endpoint chain is set |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | no | Meta app for vendor-authorised Instagram import. Needs App Review for `instagram_business_basic`. Unset disables the feature |
| `INSTAGRAM_REDIRECT_URI` | no | must match the Meta app exactly, e.g. `https://app.rico-go.com/vendor/instagram/callback` |
| `SCRAPER_API_KEY` | no | ScraperAPI key for owner-triggered offer scraping. Unset disables it. Scraped deals are labelled «من موقع المتجر» in the app, rank below vendor deals, and expire after 3 days |
| `SCRAPER_MONTHLY_CREDITS` | no | default `1000` (the free grant). Credits, not requests: plain page 1, JS rendering 10 |
| `SCRAPER_COUNTRY_CODE` | no | default `sa` — a store shows different offers by region |
| `OPENWEATHER_API_KEY` | no | classic Current Weather endpoint (60/min, 1M/month free, no card). Unset disables weather entirely — replies stop mentioning it and deals stop being reordered. Cached per ~11km cell for 20 min |
| `RESEND_API_KEY` | no | if unset, vendor-invite / password-reset emails **and app-customer verification codes** are logged to the console instead of sent — the whole signup flow is testable locally without an email account |
| `RESEND_FROM_EMAIL` | no | default `Rico <onboarding@resend.dev>` |

## Run locally

```bash
npm install
npm run start:dev   # nest start --watch, http://localhost:3000
```

No local MongoDB? `scripts/start-dev-db.js` spins up an ephemeral in-memory one:

```bash
node scripts/start-dev-db.js   # prints a MONGODB_URI to put in .env, keep it running
```

## Seed data

```bash
npm run seed
```

Creates ~7 Riyadh-area restaurants/cafes/a boutique (Arabic + English names), a handful of products with keywords in both languages, two active discounts, and two place-level deals — enough to exercise geo search, the rule-based product parser, and `/deals` immediately. Refuses to run against `NODE_ENV=production` unless you pass `--force`.

## Example requests

```bash
# Geo search over businesses (Flutter-contract-critical response shape)
curl "http://localhost:3000/search?lat=24.7136&lng=46.6753&radius=20000&categorySlug=restaurant&rank=cheapest"

# Nearby active deals (Flutter-contract-critical response shape)
curl "http://localhost:3000/deals?lat=24.7136&lng=46.6753&radius=20000"

# Rule-based product-catalog search (new)
curl "http://localhost:3000/search/products?q=%D8%A3%D8%B1%D8%AE%D8%B5%20%D8%B4%D8%A7%D9%88%D8%B1%D9%85%D8%A7"

# Arabic multi-intent classification (requires GROQ_API_KEY)
curl -X POST "http://localhost:3000/classify" -H "Content-Type: application/json" \
  -d '{"message":"أرخص شاورما قريبة"}'

# Owner login (session cookie), then an owner-only endpoint
curl -c cookies.txt -X POST "http://localhost:3000/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@rico.app","password":"ChangeMe123!","app":"owner"}'
curl -b cookies.txt "http://localhost:3000/owner/sourcing/usage"
```

### App-customer auth (bearer token, used by the Flutter app)

```bash
# 1. Register — returns {status:'otp_sent'}, never a session
curl -X POST http://localhost:3000/customer/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"ماهر","email":"me@example.com","password":"at least 8","phone":"+966512345678","brand":"rico"}'

# 2. Read the 6-digit code from the server log (no RESEND_API_KEY) or the inbox, then:
curl -X POST http://localhost:3000/customer/auth/verify-email -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","code":"123456"}'    # -> {token, expiresAt, customer}

# 3. Use the token
curl http://localhost:3000/customer/auth/me -H 'Authorization: Bearer <token>'

# 4. An order from chat: name/phone come from the account, not the body
curl -X POST http://localhost:3000/requests -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"businessId":"<id>","itemType":"product","itemId":"<id>"}'
```

Also: `POST /customer/auth/login`, `/resend-otp` (`purpose: verify_email|reset_password`), `/forgot-password`, `/reset-password`, `PATCH /customer/auth/me`, `POST /customer/auth/logout`.

## Tests

```bash
npm test   # jest — currently covers the rule-based query-parser in isolation
```

## Deploy (Render)

One web service running the combined API + static self-serve/admin dashboard (`client/`, built into `client/dist` and served same-origin):

- **Build command:** `npm run build` (runs `nest build`, then builds the Vite client — `--include=dev` is required because Render sets `NODE_ENV=production` during the build step, which would otherwise skip `vite`, a devDependency)
- **Start command:** `npm start`
- Set all env vars above in the Render dashboard.

## Notable design decisions

- **`Business`** absorbs the old `Place` collection — one entity for "a location", referenced by `Product`, `Deal`, and `BusinessClaim`.
- **`Deal.businessId`** now refers to `Business` (was `Place`); the dashboard-account owner ref was renamed to **`Deal.ownerAccountId`** (refs `Account`) to avoid two different "business" meanings on the same document. The public JSON response still calls this field `placeId` for Flutter compatibility.
- **`Account`** is the single collection backing both dashboards (`app: 'owner'|'vendor'`, `platformRole` set only for owner-app accounts). Vendor accounts are owner-invited (an owner picks a business + email, the claim is created `active` immediately, and the vendor gets a "set your password" email) — there's no public vendor signup. A vendor can still self-serve **claim an additional** business via `/vendor/claim-place`, which lands in `pending_review` and needs an owner's approval via `/owner/claims/:id/status` before it unlocks.
- **`Customer`** is a separate collection from `Account`, not another `app` value on it. The two authenticate differently (a phone's bearer token vs. a browser session cookie) and carry different required fields, and keeping them apart means a customer id can never land in a dashboard session. Tokens and 6-digit codes are stored only as sha256 hashes, one live code per purpose, five wrong guesses and the code is burned, and a password reset revokes every other device's token.
- **`POST /requests`** takes the optional customer guard, not the strict one: the app now sends a bearer token and the server derives `customerName`/`customerPhone` from the verified account, but a client already in users' hands still posts a bare name/phone with no token and keeps working. A token that *is* sent must be valid — failing open on an expired one would silently detach the request from its customer.
- **`/classify`** is exposed at `POST /classify` (the old `groq-proxy` Worker served it at its root path) — the Flutter client's base URL constant just gets `/classify` appended.
- The classifier's category list intentionally has 11 entries, not 12 — `clothing_store` was a bug introduced in the previous Express port that didn't exist in the original Worker or in Flutter's local category enum.
