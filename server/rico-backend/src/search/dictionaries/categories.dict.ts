// Category keyword dictionary for the rule-based product-search parser.
// Kept separate from the classify module's CATEGORIES (business/location
// categories) — this dictionary is about product *categories* (what's being
// sold), which for the restaurant-only MVP is mostly "food", but built
// generically since products can span any local business type.

export interface CategoryEntry {
  slug: string;
  labelAr: string;
  keywords: string[]; // Arabic + English trigger words, lowercased
}

export const CATEGORY_DICTIONARY: CategoryEntry[] = [
  {
    slug: 'food',
    labelAr: 'مأكولات',
    keywords: ['شاورما', 'shawarma', 'برجر', 'burger', 'بيتزا', 'pizza', 'مندي', 'مطعم', 'أكل', 'وجبة', 'food', 'meal'],
  },
  {
    slug: 'beverage',
    labelAr: 'مشروبات',
    keywords: ['قهوة', 'coffee', 'عصير', 'juice', 'شاي', 'tea', 'مشروب', 'drink'],
  },
  {
    slug: 'clothing',
    labelAr: 'ملابس',
    keywords: ['تيشيرت', 't-shirt', 'tshirt', 'قميص', 'shirt', 'بنطلون', 'pants', 'ملابس', 'clothing', 'clothes'],
  },
];

export function findCategoryByKeyword(token: string): CategoryEntry | null {
  const lower = token.toLowerCase();
  return CATEGORY_DICTIONARY.find((c) => c.keywords.includes(lower)) ?? null;
}
