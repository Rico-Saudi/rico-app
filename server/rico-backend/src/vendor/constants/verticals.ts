// A vertical is the kind of shop a business is, coarse enough that one
// dashboard layout fits all of them: a pharmacy and an optician both sell
// boxed items with a barcode, a hairdresser and a car wash both sell a
// service measured in time. The dashboard reads it to pick its wording,
// units and product fields (client/src/pages/vendor/verticals.js holds those
// per vertical); the slug lists here are the only place a category is
// assigned to one.
export const VERTICALS = ['food', 'pharmacy', 'grocery', 'retail', 'services', 'general'] as const;
export type Vertical = (typeof VERTICALS)[number];

const SLUGS_BY_VERTICAL: Record<Exclude<Vertical, 'general'>, readonly string[]> = {
  food: ['restaurant', 'cafe', 'bakery', 'sweets'],
  pharmacy: ['pharmacy'],
  grocery: ['supermarket', 'grocery', 'butcher'],
  retail: [
    'clothes',
    'shoe_store',
    'electronics',
    'mobile_phone',
    'jewelry_store',
    'furniture_store',
    'gift_shop',
    'bookstore',
    'toy_store',
    'pet_store',
    'cosmetics',
    'hardware_store',
    'auto_parts',
    'sporting_goods',
    'optician',
    'florist',
    'mall',
  ],
  services: [
    'hairdresser',
    'beauty',
    'car_wash',
    'laundry',
    'car_repair',
    'tailor',
    'phone_repair',
    'appliance_repair',
    'maintenance_centre',
    'oil_change',
    'clinic',
    'dentist',
    'veterinary',
    'fitness_centre',
    'car_rental',
  ],
};

const VERTICAL_BY_SLUG = new Map<string, Vertical>(
  Object.entries(SLUGS_BY_VERTICAL).flatMap(([vertical, slugs]) => slugs.map((s) => [s, vertical as Vertical])),
);

export function verticalFor(categorySlug: string | null | undefined): Vertical {
  return (categorySlug && VERTICAL_BY_SLUG.get(categorySlug)) || 'general';
}
