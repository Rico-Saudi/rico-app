// Normalizes manually-curated admin input into the places/deals repository
// shape. This is the only adapter needed for Phase 0/1 (manual curation);
// future adapters (e.g. google_places.js for price/rating enrichment) plug
// into the same repository functions without touching routes.

// Mirrors CATEGORIES in rico-backend/src/classify/constants/categories.ts.
// A slug missing here is rejected as invalid_category_slug, so an admin
// cannot curate that category by hand at all. All 62 belong here — even
// the ones Google Nearby cannot express (see google_places.js), because
// manual curation is exactly how those get filled.
const CATEGORY_SLUGS = new Set([
  'restaurant',
  'cafe',
  'pharmacy',
  'supermarket',
  'fuel',
  'mall',
  'atm',
  'bank',
  'hospital',
  'clinic',
  'fitness_centre',
  'hotel',
  'clothes',
  'mobile_phone',
  'electronics',
  'hairdresser',
  'beauty',
  'car_wash',
  'dentist',
  'mosque',
  'park',
  'bakery',
  'sweets',
  'bookstore',
  'toy_store',
  'pet_store',
  'jewelry_store',
  'furniture_store',
  'shoe_store',
  'gift_shop',
  'florist',
  'laundry',
  'veterinary',
  'car_repair',
  'car_dealer',
  'car_rental',
  'parking',
  'lawyer',
  'real_estate',
  'travel_agency',
  'insurance',
  'school',
  'university',
  'kindergarten',
  'library',
  'phone_repair',
  'appliance_repair',
  'maintenance_centre',
  'oil_change',
  'money_exchange',
  'tailor',
  'butcher',
  'cosmetics',
  'hardware_store',
  'auto_parts',
  'sporting_goods',
  'optician',
  'cinema',
  'amusement',
  'post_office',
  'police',
  'government_office',
]);

const DEAL_TYPES = new Set(['percent', 'fixed', 'bogo', 'free_item', 'bundle']);

function normalizePlace(input) {
  if (!input || typeof input !== 'object') return { error: 'invalid_body' };

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const categorySlug = typeof input.categorySlug === 'string' ? input.categorySlug : '';
  const lat = Number(input.lat);
  const lng = Number(input.lng);

  if (!name || name.length > 120) return { error: 'invalid_name' };
  if (!CATEGORY_SLUGS.has(categorySlug)) return { error: 'invalid_category_slug' };
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'invalid_lat' };
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: 'invalid_lng' };

  let priceLevel = null;
  if (input.priceLevel !== undefined && input.priceLevel !== null) {
    priceLevel = Number(input.priceLevel);
    if (!Number.isInteger(priceLevel) || priceLevel < 1 || priceLevel > 4) {
      return { error: 'invalid_price_level' };
    }
  }

  let rating = null;
  if (input.rating !== undefined && input.rating !== null) {
    rating = Number(input.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return { error: 'invalid_rating' };
    }
  }

  return {
    place: {
      name,
      nameAr: typeof input.nameAr === 'string' ? input.nameAr.trim() : null,
      categorySlug,
      lat,
      lng,
      city: typeof input.city === 'string' ? input.city.trim() : null,
      district: typeof input.district === 'string' ? input.district.trim() : null,
      address: typeof input.address === 'string' ? input.address.trim() : null,
      phone: typeof input.phone === 'string' ? input.phone.trim() : null,
      openingHours: typeof input.openingHours === 'string' ? input.openingHours.trim() : null,
      priceLevel,
      rating,
      ratingCount: input.ratingCount !== undefined ? Number(input.ratingCount) : null,
      enrichmentSource: 'manual',
    },
    sourceId: typeof input.sourceId === 'string' && input.sourceId ? input.sourceId : `manual:${name}:${lat},${lng}`,
  };
}

function normalizeDeal(input) {
  if (!input || typeof input !== 'object') return { error: 'invalid_body' };

  const placeId = typeof input.placeId === 'string' ? input.placeId : '';
  const titleAr = typeof input.titleAr === 'string' ? input.titleAr.trim() : '';
  const dealType = typeof input.dealType === 'string' ? input.dealType : '';

  if (!placeId) return { error: 'invalid_place_id' };
  if (!titleAr || titleAr.length > 120) return { error: 'invalid_title' };
  if (!DEAL_TYPES.has(dealType)) return { error: 'invalid_deal_type' };

  return {
    deal: {
      placeId,
      titleAr,
      descriptionAr: typeof input.descriptionAr === 'string' ? input.descriptionAr.trim() : null,
      dealType,
      value: input.value !== undefined && input.value !== null ? Number(input.value) : null,
      currency: typeof input.currency === 'string' ? input.currency : 'SAR',
      promoCode: typeof input.promoCode === 'string' ? input.promoCode : null,
      startsAt: input.startsAt !== undefined ? Number(input.startsAt) : null,
      endsAt: input.endsAt !== undefined ? Number(input.endsAt) : null,
      activeDays: Array.isArray(input.activeDays) ? input.activeDays : null,
      activeTime: input.activeTime && typeof input.activeTime === 'object' ? input.activeTime : null,
      status: 'active',
      source: 'manual',
      sourceRef: typeof input.sourceRef === 'string' ? input.sourceRef : null,
      verifiedAt: Date.now(),
    },
  };
}

export { normalizePlace, normalizeDeal, DEAL_TYPES };
