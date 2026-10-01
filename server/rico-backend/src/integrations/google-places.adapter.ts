// Enriches businesses with real price_level/rating from the Google Places
// API (New). This is the only adapter that costs money per call — keep the
// FieldMask minimal (only fields our schema actually stores).
//
// Used by two callers sharing one monthly budget (see ApiUsageService):
// the admin sourcing sync (owner.service.ts) and the live /search fallback
// (search.service.ts) for categories the DB doesn't have enough of yet.

export const GOOGLE_PLACES_PROVIDER = 'google_places';
export const DEFAULT_GOOGLE_PLACES_MONTHLY_CAP = 200;

// Place Photos bills as its own SKU ($7/1,000, first 1,000/month free), so it
// gets its own counter and cap rather than eating the search budget — a month
// heavy on photos must never starve search itself, which is the product.
export const GOOGLE_PHOTOS_PROVIDER = 'google_place_photos';
export const DEFAULT_GOOGLE_PHOTOS_MONTHLY_CAP = 1000;

export const GOOGLE_TYPE_BY_CATEGORY: Record<string, string[]> = {
  // Original 21 categories, broadened where Google's Table A (New) has
  // multiple relevant types instead of one narrow type per category.
  restaurant: ['restaurant', 'fast_food_restaurant', 'meal_takeaway', 'meal_delivery', 'food_court', 'diner'],
  cafe: ['cafe', 'coffee_shop'],
  pharmacy: ['pharmacy'],
  supermarket: ['supermarket', 'grocery_store', 'hypermarket', 'convenience_store'],
  fuel: ['gas_station'],
  mall: ['shopping_mall'],
  atm: ['atm'],
  bank: ['bank'],
  hospital: ['hospital', 'general_hospital'],
  clinic: ['doctor', 'medical_clinic', 'medical_center'],
  fitness_centre: ['gym', 'fitness_center'],
  hotel: ['lodging'],
  clothes: ['clothing_store', 'womens_clothing_store'],
  mobile_phone: ['cell_phone_store'],
  electronics: ['electronics_store'],
  hairdresser: ['barber_shop', 'hair_salon', 'hair_care'],
  beauty: ['beauty_salon', 'nail_salon', 'spa'],
  car_wash: ['car_wash'],
  dentist: ['dentist', 'dental_clinic'],
  mosque: ['mosque'],
  park: ['park'],

  // New categories.
  bakery: ['bakery', 'pastry_shop'],
  sweets: ['dessert_shop', 'candy_store', 'chocolate_shop', 'cake_shop'],
  bookstore: ['book_store'],
  toy_store: ['toy_store'],
  pet_store: ['pet_store'],
  jewelry_store: ['jewelry_store'],
  furniture_store: ['furniture_store', 'home_goods_store'],
  shoe_store: ['shoe_store'],
  gift_shop: ['gift_shop'],
  florist: ['florist'],
  laundry: ['laundry'],
  veterinary: ['veterinary_care'],
  car_repair: ['car_repair', 'tire_shop'],
  car_dealer: ['car_dealer'],
  car_rental: ['car_rental'],
  parking: ['parking', 'parking_lot', 'parking_garage'],
  lawyer: ['lawyer'],
  real_estate: ['real_estate_agency'],
  travel_agency: ['travel_agency', 'tour_agency'],
  insurance: ['insurance_agency'],

  // Education / public services.
  school: ['school', 'primary_school', 'secondary_school'],
  university: ['university'],
  kindergarten: ['preschool', 'child_care_agency'],
  library: ['library'],
  post_office: ['post_office'],
  police: ['police'],
  government_office: ['local_government_office', 'city_hall', 'government_office'],

  // Shops.
  butcher: ['butcher_shop'],
  cosmetics: ['cosmetics_store'],
  hardware_store: ['hardware_store', 'home_improvement_store', 'building_materials_store'],
  auto_parts: ['auto_parts_store'],
  sporting_goods: ['sporting_goods_store', 'sportswear_store'],
  tailor: ['tailor'],

  // Leisure.
  cinema: ['movie_theater'],
  amusement: ['amusement_park', 'amusement_center', 'video_arcade', 'indoor_playground'],
};

/// Arabic Text Search query for categories Google's Table A simply has no
/// type for — there is no repair/maintenance type, no currency_exchange and
/// no optician in the table, so a Nearby Search can't express them at all.
///
/// Without this, search.service falls back to the *slug* as the query text
/// and asks Google for "maintenance_centre" in Arabic-speaking cities, which
/// returns nothing useful. A category listed here is deliberately absent
/// from GOOGLE_TYPE_BY_CATEGORY above: that absence is what routes it to
/// Text Search in the first place, so never add it to both.
export const GOOGLE_TEXT_QUERY_BY_CATEGORY: Record<string, string> = {
  phone_repair: 'صيانة وتصليح جوالات',
  appliance_repair: 'صيانة أجهزة منزلية ومكيفات',
  maintenance_centre: 'مركز صيانة',
  oil_change: 'محل تغيير زيت سيارات',
  money_exchange: 'صرافة وتحويل عملات',
  optician: 'محل نظارات وبصريات',
};

// rating/userRatingCount/priceLevel are Enterprise-SKU fields, so every call
// here already bills at the Enterprise tier (1,000 free/month, then $35/1000).
// Address, phone and opening hours sit in that same tier or below, so adding
// them costs nothing extra — don't add anything outside it (reviews,
// editorialSummary) without re-checking the SKU table, that jumps the price.
//
// `places.photos` is the one exception worth spelling out: it sits in the
// IDs-Only/Essentials group, so asking for it here is free at our tier. What
// it returns is only a photo *resource name* — the money is spent later, and
// only if someone actually fetches the bytes (see fetchPhotoUri).
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.formattedAddress',
  'places.priceLevel',
  'places.rating',
  'places.userRatingCount',
  'places.nationalPhoneNumber',
  'places.regularOpeningHours',
  'places.photos',
].join(',');

// Google's enum -> our normalized 1-4 integer scale.
const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export interface GooglePlaceResult {
  sourceId: string;
  name: string;
  categorySlug: string;
  location: { type: 'Point'; coordinates: [number, number] };
  address: string | null;
  phone: string | null;
  openingHours: string | null;
  /// Google's own open/closed verdict — far more reliable than parsing an
  /// hours string ourselves. null when Google didn't return hours at all.
  openNow: boolean | null;
  priceLevel: number | null;
  rating: number | null;
  ratingCount: number | null;
  /// Google photo resource name ("places/X/photos/Y") for the first photo, or
  /// null when the place has none. Not a URL and not usable without our key —
  /// it's resolved to a real image URL by fetchPhotoUri, on demand.
  photoRef: string | null;
  /// Google requires the photo's author to be credited wherever it's shown.
  photoAttribution: string | null;
  enrichmentSource: string;
}

function apiKeyOrThrow(): string {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('google_places_not_configured');
  return apiKey;
}

function mapPlace(p: any, categorySlug: string): GooglePlaceResult {
  const hours = p.regularOpeningHours;
  // First photo only. Google returns up to 10, but the app shows one per
  // place, and every extra one we stored would be a photo we might later pay
  // to resolve for no reason.
  const photo = Array.isArray(p.photos) && p.photos.length > 0 ? p.photos[0] : null;
  return {
    sourceId: p.id,
    name: p.displayName?.text ?? 'Unknown',
    categorySlug,
    location: { type: 'Point', coordinates: [p.location.longitude, p.location.latitude] },
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    // weekdayDescriptions is localized human text ("الاثنين: 9:00 ص – 10:00 م")
    // — display only. We never parse it; openNow below is the machine answer.
    openingHours: Array.isArray(hours?.weekdayDescriptions) ? hours.weekdayDescriptions.join('\n') : null,
    openNow: typeof hours?.openNow === 'boolean' ? hours.openNow : null,
    priceLevel: PRICE_LEVEL_MAP[p.priceLevel] || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    photoRef: typeof photo?.name === 'string' ? photo.name : null,
    photoAttribution: photo?.authorAttributions?.[0]?.displayName ?? null,
    enrichmentSource: 'google',
  };
}

async function callGoogle(endpoint: string, body: unknown): Promise<any[]> {
  const response = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKeyOrThrow(),
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google_places_error:${response.status}:${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.places || [];
}

/// Free-text search — the only Google endpoint that can handle a brand name
/// ("ستاربكس"), an open-now filter, or a category we have no fixed type for.
/// Nearby Search supports none of those, which is why both exist here.
export async function searchText({
  textQuery,
  lat,
  lng,
  radiusMeters,
  categorySlug,
  openNow = false,
  includedType,
}: {
  textQuery: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  categorySlug: string;
  openNow?: boolean;
  includedType?: string;
}): Promise<GooglePlaceResult[]> {
  const places = await callGoogle('searchText', {
    textQuery,
    pageSize: 20,
    // Bias (not restrict): a brand may legitimately sit just outside the
    // radius, and returning it ranked by distance beats returning nothing.
    locationBias: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
    },
    rankPreference: 'DISTANCE',
    languageCode: 'ar',
    ...(openNow ? { openNow: true } : {}),
    ...(includedType ? { includedType } : {}),
  });
  return places.map((p: any) => mapPlace(p, categorySlug));
}

export async function searchNearby({
  lat,
  lng,
  radiusMeters,
  categorySlug,
}: {
  lat: number;
  lng: number;
  radiusMeters: number;
  categorySlug: string;
}): Promise<GooglePlaceResult[]> {
  const includedTypes = GOOGLE_TYPE_BY_CATEGORY[categorySlug];
  if (!includedTypes) {
    throw new Error(`no_google_type_for_category:${categorySlug}`);
  }

  const places = await callGoogle('searchNearby', {
    includedTypes,
    maxResultCount: 20,
    languageCode: 'ar',
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
    },
  });

  return places.map((p: any) => mapPlace(p, categorySlug));
}

/// Resolves a stored photo resource name to a real, fetchable image URL.
///
/// This is the call that costs money ($7/1,000 — see GOOGLE_PHOTOS_PROVIDER),
/// so it must never be made speculatively: callers resolve a photo only when a
/// client is asking for that exact image right now.
///
/// `skipHttpRedirect` asks Google for the URL as JSON instead of a 302 to the
/// image. We want the URL itself so we can cache and hand it out repeatedly;
/// following the redirect would stream the bytes through our server on every
/// view and bill us for each one.
export async function fetchPhotoUri(photoRef: string, maxWidthPx: number): Promise<string | null> {
  const url = `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
  const response = await fetch(url, { headers: { 'X-Goog-Api-Key': apiKeyOrThrow() } });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google_photo_error:${response.status}:${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return typeof data?.photoUri === 'string' ? data.photoUri : null;
}
