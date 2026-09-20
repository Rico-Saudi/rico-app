import { isPathAllowed, parseRobots } from './robots';
import { discountedOnly, extractOffers, parseJsonLd } from './offer-extractor';
import { USER_AGENT } from './scraping.constants';

// Two pieces carry the weight here. The robots reader decides whether we may
// ask a site for anything at all, and the extractor decides what counts as a
// fact worth showing a user. A bug in the first is a site being read against
// its wishes; a bug in the second is a wrong price someone drives to.
describe('robots.txt', () => {
  const rules = (body: string) => parseRobots(body, USER_AGENT);

  it('honours a blanket disallow', () => {
    const r = rules('User-agent: *\nDisallow: /');
    expect(isPathAllowed(r, '/offers')).toBe(false);
  });

  it('honours a block on one section while leaving the rest open', () => {
    const r = rules('User-agent: *\nDisallow: /admin\nDisallow: /cart');
    expect(isPathAllowed(r, '/admin/login')).toBe(false);
    expect(isPathAllowed(r, '/cart')).toBe(false);
    expect(isPathAllowed(r, '/offers')).toBe(true);
  });

  it('lets a longer Allow carve an exception out of a broader Disallow', () => {
    const r = rules('User-agent: *\nDisallow: /products\nAllow: /products/offers');
    expect(isPathAllowed(r, '/products/shoes')).toBe(false);
    expect(isPathAllowed(r, '/products/offers')).toBe(true);
  });

  it('obeys a rule naming RicoBot over the wildcard group', () => {
    // A site that names us specifically has made a decision about us, and it
    // outranks whatever it says to crawlers in general.
    const r = rules('User-agent: *\nAllow: /\n\nUser-agent: RicoBot\nDisallow: /');
    expect(isPathAllowed(r, '/offers')).toBe(false);
  });

  it('treats an empty Disallow as permission, per the convention', () => {
    const r = rules('User-agent: *\nDisallow:');
    expect(isPathAllowed(r, '/anything')).toBe(true);
  });

  it('ignores comments and blank lines', () => {
    const r = rules('# our rules\n\nUser-agent: *\nDisallow: /private # keep out\n');
    expect(isPathAllowed(r, '/private/x')).toBe(false);
    expect(isPathAllowed(r, '/public')).toBe(true);
  });

  it('applies one rule block to several user-agents listed together', () => {
    const r = rules('User-agent: BadBot\nUser-agent: RicoBot\nDisallow: /offers');
    expect(isPathAllowed(r, '/offers')).toBe(false);
  });

  it('handles a wildcard inside a path', () => {
    const r = rules('User-agent: *\nDisallow: /*/checkout');
    expect(isPathAllowed(r, '/sa/checkout')).toBe(false);
    expect(isPathAllowed(r, '/sa/offers')).toBe(true);
  });
});

describe('offer extraction', () => {
  const page = (jsonLd: unknown) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;

  it('reads a product with a real reduction', () => {
    const offers = extractOffers(
      page({
        '@type': 'Product',
        name: 'تمر سكري فاخر ١ كجم',
        description: 'عرض نهاية الأسبوع',
        offers: { '@type': 'Offer', price: '19.00', priceCurrency: 'SAR', highPrice: '29.00' },
      }),
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ titleAr: 'تمر سكري فاخر ١ كجم', price: 19, wasPrice: 29, currency: 'SAR' });
  });

  it('refuses to call a plain price a discount', () => {
    // The core honesty rule: without a stated "was" price there is no saving,
    // and inventing one would put a claim in front of a user that the shop
    // never made.
    const offers = extractOffers(
      page({ '@type': 'Product', name: 'حليب طازج', offers: { price: '5.00', priceCurrency: 'SAR' } }),
    );

    expect(offers[0].wasPrice).toBeNull();
    expect(discountedOnly(offers)).toHaveLength(0);
  });

  it('ignores a "was" price that is not actually higher', () => {
    // Template artefact, not a discount.
    const offers = extractOffers(
      page({ '@type': 'Product', name: 'أرز', offers: { price: '20', highPrice: '20', priceCurrency: 'SAR' } }),
    );
    expect(offers[0].wasPrice).toBeNull();
  });

  it('reads products nested in an ItemList, which is how category pages ship', () => {
    const offers = extractOffers(
      page({
        '@type': 'ItemList',
        itemListElement: [
          { item: { '@type': 'Product', name: 'زيت زيتون', offers: { price: '30', highPrice: '45' } } },
          { item: { '@type': 'Product', name: 'عسل', offers: { price: '55', highPrice: '70' } } },
        ],
      }),
    );

    expect(offers.map((o) => o.titleAr)).toEqual(['زيت زيتون', 'عسل']);
  });

  it('reads Arabic-Indic digits, which Gulf retail sites use', () => {
    const offers = extractOffers(
      page({ '@type': 'Product', name: 'سكر', offers: { price: '١٥', highPrice: '٢٥', priceCurrency: 'SAR' } }),
    );
    expect(offers[0]).toMatchObject({ price: 15, wasPrice: 25 });
  });

  it('keeps one entry per product, however often the page repeats it', () => {
    const html =
      page({ '@type': 'Product', name: 'شاي', offers: { price: '10', highPrice: '15' } }) +
      page({ '@type': 'Product', name: 'شاي', offers: { price: '10', highPrice: '15' } });
    expect(extractOffers(html)).toHaveLength(1);
  });

  it('skips a malformed block instead of losing the valid ones beside it', () => {
    const html =
      '<script type="application/ld+json">{ not json </script>' +
      page({ '@type': 'Product', name: 'قهوة', offers: { price: '25', highPrice: '40' } });
    expect(extractOffers(html)).toHaveLength(1);
  });

  it('extracts nothing from a page with no structured data', () => {
    // We do not fall back to guessing at CSS classes — see the module comment.
    expect(extractOffers('<html><body><div class="price">19 SAR</div></body></html>')).toEqual([]);
  });

  it('ignores schema types that are not products', () => {
    expect(extractOffers(page({ '@type': 'Organization', name: 'بنده' }))).toEqual([]);
  });

  it('finds entities inside @graph', () => {
    const offers = parseJsonLd(
      page({ '@graph': [{ '@type': 'Product', name: 'جبن', offers: { price: '12', highPrice: '18' } }] }),
    );
    expect(offers.some((n) => n?.name === 'جبن')).toBe(true);
  });
});
