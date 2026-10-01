/// Pulls offers out of a fetched page.
///
/// Only JSON-LD is read. Sites embed schema.org data specifically so machines
/// can understand their products and prices — it is the one part of a page
/// published *for* this purpose, it is stable across redesigns, and reading it
/// needs no per-site selectors to maintain.
///
/// The alternative, guessing at CSS classes, breaks on every redesign and
/// tends to produce confident nonsense in the meantime: a stray number read as
/// a price is worse than no offer at all, because it reaches a user as a fact.
/// If a site publishes no structured data, we extract nothing and say so.

export interface ExtractedOffer {
  titleAr: string;
  descriptionAr: string | null;
  /// Post-discount price, when the page states one.
  price: number | null;
  /// Pre-discount price, when stated — the pair is what makes a discount real
  /// rather than inferred.
  wasPrice: number | null;
  currency: string;
}

/// schema.org types worth reading. Anything else is ignored rather than
/// guessed at.
const PRODUCT_TYPES = ['product', 'offer', 'aggregateoffer', 'individualproduct'];

function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) return textOf(value[0]);
  return null;
}

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    // Arabic-Indic digits appear on Gulf retail sites alongside Latin ones.
    const normalized = value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const parsed = Number(normalized.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  if (Array.isArray(value)) return numberOf(value[0]);
  return null;
}

/// Every JSON-LD block on the page, flattened — @graph and arrays included,
/// since sites nest their products inconsistently.
export function parseJsonLd(html: string): any[] {
  const blocks: any[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        blocks.push(item);
        // @graph is how most CMSs emit more than one entity per block.
        if (Array.isArray(item?.['@graph'])) blocks.push(...item['@graph']);
        // ItemList wraps category pages, which is where offers usually live.
        if (Array.isArray(item?.itemListElement)) {
          for (const entry of item.itemListElement) {
            blocks.push(entry?.item ?? entry);
          }
        }
      }
    } catch {
      // A malformed block is skipped, not fatal — sites routinely ship one
      // broken script alongside several valid ones.
      continue;
    }
  }

  return blocks;
}

function typesOf(node: any): string[] {
  const raw = node?.['@type'];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((t) => typeof t === 'string').map((t) => t.toLowerCase());
}

export function extractOffers(html: string): ExtractedOffer[] {
  const offers: ExtractedOffer[] = [];
  const seen = new Set<string>();

  for (const node of parseJsonLd(html)) {
    if (!typesOf(node).some((t) => PRODUCT_TYPES.includes(t))) continue;

    const titleAr = textOf(node.name) ?? textOf(node.title);
    if (!titleAr) continue;

    // One entry per product name. Retail pages repeat the same item across
    // carousels and "related items" strips.
    const key = titleAr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const offerNode = node.offers ?? node;
    const price = numberOf(offerNode?.price ?? offerNode?.lowPrice);
    // Several vocabularies for the pre-discount figure, none universal.
    const wasPrice = numberOf(
      offerNode?.priceSpecification?.price ?? offerNode?.highPrice ?? node?.priceSpecification?.price,
    );

    offers.push({
      titleAr,
      descriptionAr: textOf(node.description),
      price,
      // Only a genuine reduction counts. An equal or higher "was" price is a
      // template artefact, and reporting it as a discount would be inventing
      // a saving the shop never offered.
      wasPrice: wasPrice !== null && price !== null && wasPrice > price ? wasPrice : null,
      currency: textOf(offerNode?.priceCurrency) ?? 'SAR',
    });
  }

  return offers;
}

/// Offers worth storing: ones stating a real reduction.
///
/// A plain price is not an offer. Rico shows deals, and listing every product
/// a shop sells as a "deal" would make the word meaningless to the user.
export function discountedOnly(offers: ExtractedOffer[]): ExtractedOffer[] {
  return offers.filter((o) => o.price !== null && o.wasPrice !== null);
}
