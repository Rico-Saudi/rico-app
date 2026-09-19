import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { VendorImpression, VendorImpressionDocument } from './schemas/vendor-impression.schema';
import { SearchGap, SearchGapDocument } from './schemas/search-gap.schema';
import { DealsService } from '../deals/deals.service';
import { SubmitDealDto } from './dto/submit-deal.dto';
import { ImpressionItemDto } from './dto/track-impressions.dto';
import { TrackSearchGapDto } from './dto/track-search-gap.dto';
import { ResolveOrderDto } from './dto/resolve-order.dto';
import { bestMatch, normalizeArabic, similarity } from './order-matching.util';

// Deliberately stricter than the per-dish threshold. Nearly every shop name
// carries a category word — مطعم, كافيه, صيدلية — so sharing one is worth
// almost nothing: "مطعم البيك" scores 0.56 against "مطعم الماهر" on that word
// alone. Anything below this is a different shop, and ordering from the wrong
// shop is far worse than admitting we couldn't find it. Genuine variants clear
// it easily ("الماهر" -> "مطعم الماهر" scores 0.88).
const NAME_MATCH_THRESHOLD = 0.7;

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(VendorImpression.name) private readonly impressionModel: Model<VendorImpressionDocument>,
    @InjectModel(SearchGap.name) private readonly searchGapModel: Model<SearchGapDocument>,
    private readonly dealsService: DealsService,
  ) {}

  // Backs the chat "browse this business's products/deals" flow — a
  // consolidated read so the client doesn't have to compose product +
  // discount + deal calls itself. finalPrice already reflects any active
  // discount (kept in sync by PriceCalcService), so raw Discount records
  // aren't needed here.
  async getCatalog(businessId: string) {
    const business = await this.businessModel.findById(businessId).lean();
    if (!business) throw new NotFoundException({ error: 'business_not_found' });

    const [products, deals] = await Promise.all([
      this.productModel.find({ businessId, isActive: true }).lean(),
      this.dealsService.findActiveForBusiness(businessId, new Date()),
    ]);

    return {
      businessId: String(business._id),
      businessName: business.nameAr || business.name,
      products: products.map((p) => ({
        id: p._id,
        name: p.name,
        category: p.category,
        price: p.price,
        finalPrice: p.finalPrice,
        imageUrl: p.imageUrl ?? null,
      })),
      deals: deals.map((d: any) => ({
        id: d._id,
        titleAr: d.titleAr,
        descriptionAr: d.descriptionAr,
        dealType: d.dealType,
        value: d.value,
        currency: d.currency,
        promoCode: d.promoCode,
      })),
    };
  }

  /**
   * Resolves "بدي أطلب من <محل> <صنف> و<صنف>" into a ready basket.
   *
   * Runs shop-first: without a shop there is no catalogue to match against, so
   * a miss there is reported on its own rather than as twenty missing dishes.
   * Matching stays on the server because this is where the catalogue lives and
   * where the Arabic normalizing already has to happen for search.
   */
  async resolveOrder(dto: ResolveOrderDto) {
    const business = await this.findBusinessByName(dto.placeName);
    if (!business) {
      return { business: null, catalog: null, matched: [], unmatched: dto.items.map((i) => i.name) };
    }

    const businessId = String(business._id);
    const catalog = await this.getCatalog(businessId);

    // Deals are matchable too: "بدي عرض الشاورما" names something the shop
    // offers just as much as a dish does.
    const candidates = [
      ...catalog.products.map((p: any) => ({ id: String(p.id), name: p.name, kind: 'product' as const, row: p })),
      ...catalog.deals.map((d: any) => ({ id: String(d.id), name: d.titleAr, kind: 'deal' as const, row: d })),
    ];

    const matched: any[] = [];
    const unmatched: string[] = [];

    for (const requested of dto.items) {
      const hit = bestMatch(requested.name, candidates);
      if (!hit) {
        unmatched.push(requested.name);
        continue;
      }

      const quantity = requested.quantity ?? 1;
      // Two spoken lines landing on one dish ("كنافة" then "كنافة نابلسية")
      // become one basket line, the same way the basket itself merges repeats.
      const existing = matched.find((m) => m.itemId === hit.item.id);
      if (existing) {
        existing.quantity = Math.min(99, existing.quantity + quantity);
        continue;
      }

      matched.push(
        hit.item.kind === 'product'
          ? {
              itemType: 'product',
              itemId: hit.item.id,
              label: hit.item.row.name,
              detail: `${hit.item.row.finalPrice} ر.س`,
              unitPrice: hit.item.row.finalPrice,
              imageUrl: hit.item.row.imageUrl ?? null,
              quantity,
              requestedAs: requested.name,
            }
          : {
              itemType: 'deal',
              itemId: hit.item.id,
              label: hit.item.row.titleAr,
              detail: hit.item.row.dealType,
              unitPrice: null,
              imageUrl: null,
              quantity,
              requestedAs: requested.name,
            },
      );
    }

    return {
      business: { id: businessId, name: catalog.businessName },
      catalog,
      matched,
      unmatched,
    };
  }

  /**
   * Finds the shop the customer named. Mongo's regex can only do literal
   * matching, so it casts a wide net on the longest word of the name and the
   * ranking is done here, where the Arabic normalizing applies — "مطعم
   * الماهر" has to find "مطعم الماهر" whichever way either side spells it.
   */
  private async findBusinessByName(placeName: string) {
    const tokens = normalizeArabic(placeName).split(' ').filter((t) => t.length > 2);
    if (tokens.length === 0) return null;

    const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const candidates = await this.businessModel
      .find({ $or: escaped.flatMap((t) => [{ name: new RegExp(t, 'i') }, { nameAr: new RegExp(t, 'i') }]) })
      .limit(25)
      .lean();

    let best: { doc: any; score: number } | null = null;
    for (const doc of candidates) {
      // Either spelling of the name can be the one the customer used.
      const score = Math.max(similarity(placeName, doc.nameAr || ''), similarity(placeName, doc.name || ''));
      if (score > (best?.score ?? 0)) best = { doc, score };
    }
    return best && best.score >= NAME_MATCH_THRESHOLD ? best.doc : null;
  }

  async searchPlaces(q: string) {
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const places = await this.businessModel
      .find({ $or: [{ name: new RegExp(escaped, 'i') }, { nameAr: new RegExp(escaped, 'i') }] })
      .limit(8)
      .lean();

    return {
      places: places.map((p) => ({
        id: p._id,
        name: p.name,
        nameAr: p.nameAr,
        categorySlug: p.categorySlug,
        city: p.city,
        district: p.district,
      })),
    };
  }

  // The business must already exist in our system — this form intentionally
  // does not let an anonymous caller create a brand-new business (that
  // would let anyone invent a fake business with no review gate at all).
  async submitDeal(dto: SubmitDealDto) {
    const business = await this.businessModel.findById(dto.businessId).lean();
    if (!business) throw new NotFoundException({ error: 'place_not_found' });

    const deal = await this.dealsService.createManual({
      businessId: dto.businessId,
      titleAr: dto.titleAr.trim(),
      descriptionAr: dto.descriptionAr?.trim(),
      dealType: dto.dealType,
      value: dto.value,
      currency: 'SAR',
      promoCode: dto.promoCode?.trim(),
      source: 'partner_selfserve',
      status: 'pending_review',
    });

    return { dealId: deal._id, status: 'pending_review' };
  }

  async trackImpressions(items: ImpressionItemDto[]): Promise<{ tracked: number }> {
    const docs = items.map((item) => ({ businessId: item.businessId, dealId: item.dealId ?? null }));
    const result = await this.impressionModel.insertMany(docs, { ordered: false });
    return { tracked: result.length };
  }

  async trackSearchGap(dto: TrackSearchGapDto): Promise<{ tracked: boolean }> {
    await this.searchGapModel.create({ categorySlug: dto.categorySlug, lat: dto.lat, lng: dto.lng });
    return { tracked: true };
  }
}
