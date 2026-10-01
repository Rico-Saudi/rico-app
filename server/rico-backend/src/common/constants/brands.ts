// One backend serves every regional variant of the app, so neither the
// assistant's name nor its dialect can be baked into the prompts — the client
// says which brand is asking, and the prompt builders pick both from here.
//
// Dialect is per brand, not per deployment: ريكو answers in Saudi and تدلل in
// Jordanian from the same process. Before this, the prompts hardcoded one
// dialect, so whichever variant the deployment was built from set the dialect
// for all of them — a Jordanian build introduced itself as تدلل and then spoke
// like ريكو.

export type DialectSlug = 'saudi' | 'jordanian';

export interface Brand {
  /** الاسم الذي يعرّف به المساعد عن نفسه */
  name: string;
  /** لهجة الردود — تُختار بها نسخة البرومبت */
  dialect: DialectSlug;
}

export const BRANDS: Record<string, Brand> = {
  rico: { name: 'ريكو', dialect: 'saudi' },
  tadallal: { name: 'تدلل', dialect: 'jordanian' },
};

// Clients already in users' hands send no brand at all, so the default has
// to stay the original one — anything else would silently rename the
// assistant, and now also re-dialect it, for every installed Rico build.
export const DEFAULT_BRAND = 'rico';

/** Resolves a client-supplied brand slug to its name and dialect, falling
 * back to the default for anything unknown. Never throws: an unrecognized
 * slug is a stale or hand-edited client, and answering as ريكو in Saudi
 * beats a 400. */
export function brandFor(slug?: string): Brand {
  return (slug && BRANDS[slug]) || BRANDS[DEFAULT_BRAND];
}

export const BRAND_SLUGS = Object.keys(BRANDS);
