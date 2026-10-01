// Attribute keyword dictionary — generic even though the restaurant-only
// MVP mostly needs `spiceLevel`, since products can carry arbitrary
// attributes per category (color/size for clothing, etc.).

export interface AttributeEntry {
  key: string; // e.g. "color", "size", "spiceLevel"
  value: string; // normalized value stored on the product, e.g. "black"
  keywords: string[]; // Arabic + English trigger words, lowercased
}

export const ATTRIBUTE_DICTIONARY: AttributeEntry[] = [
  // colors
  { key: 'color', value: 'black', keywords: ['أسود', 'اسود', 'black'] },
  { key: 'color', value: 'white', keywords: ['أبيض', 'ابيض', 'white'] },
  { key: 'color', value: 'red', keywords: ['أحمر', 'احمر', 'red'] },
  { key: 'color', value: 'blue', keywords: ['أزرق', 'ازرق', 'blue'] },
  { key: 'color', value: 'green', keywords: ['أخضر', 'اخضر', 'green'] },
  // sizes
  { key: 'size', value: 'small', keywords: ['صغير', 'small', 's'] },
  { key: 'size', value: 'medium', keywords: ['وسط', 'متوسط', 'medium', 'm'] },
  { key: 'size', value: 'large', keywords: ['كبير', 'large', 'l'] },
  // spice level (restaurant MVP)
  { key: 'spiceLevel', value: 'spicy', keywords: ['حار', 'حاره', 'حارة', 'spicy'] },
  { key: 'spiceLevel', value: 'mild', keywords: ['مو حار', 'عادي', 'mild'] },
];

export function findAttributeByKeyword(token: string): AttributeEntry | null {
  const lower = token.toLowerCase();
  return ATTRIBUTE_DICTIONARY.find((a) => a.keywords.includes(lower)) ?? null;
}

export function allAttributeKeywords(): string[] {
  return ATTRIBUTE_DICTIONARY.flatMap((a) => a.keywords);
}
