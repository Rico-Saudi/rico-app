// Multi-intent LLM classifier constants — ported from server/groq-proxy.
// CATEGORIES intentionally excludes 'clothing_store': that slug was a
// porting bug introduced in the old rico-backend Express port (present
// neither in the live groq-proxy Worker nor in Flutter's local category
// enum), so any category the model returns is guaranteed to resolve on the
// client instead of being silently dropped.

export const CATEGORIES = [
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

  // Education.
  'school',
  'university',
  'kindergarten',
  'library',

  // Repair & maintenance. Google's Table A has no generic repair type at
  // all, so these four resolve through GOOGLE_TEXT_QUERY_BY_CATEGORY (an
  // Arabic Text Search) rather than a Nearby type — see the adapter.
  'phone_repair',
  'appliance_repair',
  'maintenance_centre',
  'oil_change',

  // Money & clothing services. 'money_exchange' is likewise type-less:
  // Table A's Finance group is only accounting/atm/bank.
  'money_exchange',
  'tailor',

  // Shops.
  'butcher',
  'cosmetics',
  'hardware_store',
  'auto_parts',
  'sporting_goods',
  'optician',

  // Leisure.
  'cinema',
  'amusement',

  // Public services.
  'post_office',
  'police',
  'government_office',
] as const;

export const OTHER_TAG_KEYS = ['amenity', 'shop', 'leisure', 'tourism', 'office', 'craft'] as const;
export const RANKS = ['nearest', 'cheapest', 'open_now', 'best_rated'] as const;
export const MAX_INTENTS = 3;
