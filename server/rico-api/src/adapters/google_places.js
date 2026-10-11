// Enriches places with real price_level/rating from the Google Places API
// (New). This is the only adapter that costs money per call — keep the
// FieldMask minimal (only fields our schema actually stores) to avoid paying
// for Pro-tier fields we don't use.

// Mirrors GOOGLE_TYPE_BY_CATEGORY in
// rico-backend/src/integrations/google-places.adapter.ts.
//
// The 56 categories below are every one Google Table A can express as a
// Nearby type. The remaining 6 (phone_repair, appliance_repair,
// maintenance_centre, oil_change, money_exchange, optician) are absent
// on purpose: Table A has no repair/maintenance type, no
// currency_exchange and no optician, so there is nothing to map them to.
// searchNearby throws no_google_type_for_category for those by design —
// rico-backend reaches them through an Arabic Text Search instead, which
// this Worker has no endpoint for. Curate them manually (manual.js).
const GOOGLE_TYPE_BY_CATEGORY = {
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
  school: ['school', 'primary_school', 'secondary_school'],
  university: ['university'],
  kindergarten: ['preschool', 'child_care_agency'],
  library: ['library'],
  post_office: ['post_office'],
  police: ['police'],
  government_office: ['local_government_office', 'city_hall', 'government_office'],
  butcher: ['butcher_shop'],
  cosmetics: ['cosmetics_store'],
  hardware_store: ['hardware_store', 'home_improvement_store', 'building_materials_store'],
  auto_parts: ['auto_parts_store'],
  sporting_goods: ['sporting_goods_store', 'sportswear_store'],
  tailor: ['tailor'],
  cinema: ['movie_theater'],
  amusement: ['amusement_park', 'amusement_center', 'video_arcade', 'indoor_playground'],
};

const FIELD_MASK = 'places.id,places.displayName,places.location,places.priceLevel,places.rating,places.userRatingCount';

// Google's enum -> our normalized 1-4 integer scale (see schema.sql price_level).
const PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function searchNearby(env, { lat, lng, radiusMeters, categorySlug }) {
  const includedTypes = GOOGLE_TYPE_BY_CATEGORY[categorySlug];
  if (!includedTypes) {
    throw new Error(`no_google_type_for_category:${categorySlug}`);
  }
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error('google_places_not_configured');
  }

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`google_places_error:${response.status}:${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const places = data.places || [];

  return places.map((p) => ({
    sourceId: p.id,
    name: p.displayName && p.displayName.text ? p.displayName.text : 'Unknown',
    categorySlug,
    lat: p.location.latitude,
    lng: p.location.longitude,
    priceLevel: PRICE_LEVEL_MAP[p.priceLevel] || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    enrichmentSource: 'google',
  }));
}

export { searchNearby, GOOGLE_TYPE_BY_CATEGORY };
