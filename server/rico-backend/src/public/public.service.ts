import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { VendorImpression, VendorImpressionDocument } from './schemas/vendor-impression.schema';
import { SearchGap, SearchGapDocument } from './schemas/search-gap.schema';
import { CatalogGap, CatalogGapDocument } from './schemas/catalog-gap.schema';
import { DealsService } from '../deals/deals.service';
import { SubmitDealDto } from './dto/submit-deal.dto';
import { ImpressionItemDto } from './dto/track-impressions.dto';
import { TrackSearchGapDto } from './dto/track-search-gap.dto';
import { ResolveOrderDto } from './dto/resolve-order.dto';
import {
  closestMatch,
  MATCH_THRESHOLD,
  normalizeArabic,
  similarity,
  SUGGESTION_THRESHOLD,
} from './order-matching.util';
import { PickPreference, readGenericItem } from './generic-order.util';
import { CustomerRequest, CustomerRequestDocument } from '../requests/schemas/request.schema';
import { haversineMeters } from '../common/utils/geo.util';

// Deliberately stricter than the per-dish threshold. Nearly every shop name
// carries a category word — مطعم, كافيه, صيدلية — so sharing one is worth
// almost nothing: "مطعم البيك" scores 0.56 against "مطعم الماهر" on that word
// alone. Anything below this is a different shop, and ordering from the wrong
// shop is far worse than admitting we couldn't find it. Genuine variants clear
// it easily ("الماهر" -> "مطعم الماهر" scores 0.88).
const NAME_MATCH_THRESHOLD = 0.7;

/**
 * One shape for every path out of resolveOrder — shop chosen, shop named,
 * shop not found, or no shop yet. Declared rather than inferred so a field
 * added to one branch can't quietly go missing from the others, which is
 * exactly what the client then fails to read.
 */
export interface ResolvedOrderResult {
  business: { id: string; name: string } | null;
  catalog: any | null;
  matched: any[];
  unmatched: string[];
  suggestions: any[];
  /** Shops to offer when the customer named dishes but no shop. */
  shopOptions: any[];
  /** They tapped one of those offered shops rather than naming it. */
  pickedFromOptions: boolean;
}

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(VendorImpression.name) private readonly impressionModel: Model<VendorImpressionDocument>,
    @InjectModel(SearchGap.name) private readonly searchGapModel: Model<SearchGapDocument>,
    @InjectModel(CatalogGap.name) private readonly catalogGapModel: Model<CatalogGapDocument>,
    @InjectModel(CustomerRequest.name) private readonly requestModel: Model<CustomerRequestDocument>,
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
  async resolveOrder(dto: ResolveOrderDto): Promise<ResolvedOrderResult> {
    // ثلاث طرق نعرف بها المحل، وكل اللي بعدها (مطابقة الأصناف، الاقتراحات،
    // تسجيل النواقص) واحد بالثلاث:
    //  - businessId: العميل ضغط محلاً من القائمة اللي اقترحناها عليه.
    //  - placeName: سمّاه بنفسه.
    //  - ولا واحد: ما اختار محلاً بعد، فما نختار عنه — نرجّع له المحلات
    //    القريبة مرتّبة بمن عنده طلبه، ويقرر هو. اختيار محل نيابةً عنه
    //    يخفي عنه إن فيه غيره أقرب أو عنده طلبه كاملاً.
    if (!dto.businessId && !dto.placeName) {
      return this.shopOptionsFor(dto);
    }

    const business = dto.businessId
      ? await this.businessModel.findById(dto.businessId).lean()
      : await this.findBusinessByName(dto.placeName!);
    if (!business) {
      return {
        business: null,
        catalog: null,
        matched: [],
        unmatched: dto.items.map((i) => i.name),
        suggestions: [],
        shopOptions: [],
        pickedFromOptions: !!dto.businessId,
      };
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
    const suggestions: any[] = [];
    const gaps: { requestedItem: string; nearestLabel: string | null; nearestScore: number | null }[] = [];

    // Popularity is read once for the whole order, and only when something
    // actually needs choosing — an order that names its dishes pays nothing
    // for this.
    const needsPick = dto.items.some((i) => readGenericItem(i.name).isGeneric);
    const popularity = needsPick ? await this.itemPopularity(businessId) : new Map<string, number>();

    for (const requested of dto.items) {
      const closest = closestMatch(requested.name, candidates);
      const hit = closest && closest.score >= MATCH_THRESHOLD ? closest : null;

      // Named nothing, and the menu has no row by that name either: choose
      // for them. Deliberately *after* the normal match — a shop with a real
      // "وجبة عائلية" on the menu serves that, and only a shop with nothing
      // by that name gets here.
      if (!hit) {
        const reading = readGenericItem(requested.name);
        if (reading.isGeneric) {
          const picked = this.pickForCustomer(
            catalog.products,
            reading.prefer,
            popularity,
            new Set(matched.map((m) => m.itemId)),
          );
          if (picked) {
            const quantity = requested.quantity ?? 1;
            matched.push({
              itemType: 'product',
              itemId: String(picked.product.id),
              label: picked.product.name,
              detail: `${picked.product.finalPrice} ر.س`,
              unitPrice: picked.product.finalPrice,
              imageUrl: picked.product.imageUrl ?? null,
              quantity,
              requestedAs: requested.name,
              // Why this one and not another. The customer never named it,
              // so an unexplained row in their basket is a row they have to
              // audit — the reason is what makes the pick trustworthy.
              pickedBy: picked.reason,
            });
            continue;
          }
          // Nothing to pick from (an empty menu) — falls through and is
          // reported as a miss, which is the truth.
        }

        unmatched.push(requested.name);
        // الصنف ما هو بالقائمة — وهذي إشارة طلب لصاحب المحل، مو مجرد خطأ
        // نعرضه ونرميه.
        gaps.push({
          requestedItem: requested.name,
          nearestLabel: closest?.item.name ?? null,
          nearestScore: closest ? Number(closest.score.toFixed(2)) : null,
        });
        // قريب بما يكفي ليُعرض كسؤال ("تقصد ...؟") لا ليُفترض جواباً.
        if (closest && closest.score >= SUGGESTION_THRESHOLD) {
          suggestions.push({
            requested: requested.name,
            itemType: closest.item.kind,
            itemId: closest.item.id,
            label: closest.item.kind === 'product' ? closest.item.row.name : closest.item.row.titleAr,
          });
        }
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

    // أفضل جهد بحت: تسجيل الطلب الفائت تحليلات لصاحب المحل، وفشلها ما
    // يصح يضيّع على العميل سلّته الجاهزة — فما ننتظرها.
    if (gaps.length > 0) {
      this.gapWrite = this.catalogGapModel
        .insertMany(gaps.map((g) => ({ businessId, ...g })))
        .catch((e) => console.error('[public] catalog gap tracking failed:', e?.message || e));
    }

    return {
      business: { id: businessId, name: catalog.businessName },
      catalog,
      matched,
      unmatched,
      suggestions,
      // العميل اختار هذا المحل من قائمة اقترحناها عليه، ما سمّاه ابتداءً —
      // الرد يقولها عشان يبقى واضحاً إن الاختيار اختياره.
      pickedFromOptions: !!dto.businessId,
      shopOptions: [],
    };
  }

  /**
   * The shops to offer when the customer named dishes but no shop.
   *
   * Ordered by how much of their order each one can actually serve, then by
   * distance. Coverage outranks distance deliberately: walking two more
   * minutes for the whole order beats arriving at the nearest place and
   * finding half of it missing.
   *
   * Shops that have none of it are still returned, last and honestly marked.
   * "ما لقيت" with an empty screen is a dead end; the nearby restaurants are
   * a real next step even when none of them stocks what was asked for.
   */
  private async shopOptionsFor(dto: ResolveOrderDto): Promise<ResolvedOrderResult> {
    const empty: ResolvedOrderResult = {
      business: null,
      catalog: null,
      matched: [],
      unmatched: [],
      suggestions: [],
      shopOptions: [],
      pickedFromOptions: false,
    };
    if (dto.lat === undefined || dto.lng === undefined || !dto.categorySlug) return empty;

    const candidates = await this.businessModel
      .find({
        isActive: true,
        categorySlug: dto.categorySlug,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [dto.lng, dto.lat] },
            $maxDistance: PublicService.ORDER_SEARCH_RADIUS_METERS,
          },
        },
      })
      .limit(PublicService.ORDER_SHOP_CANDIDATES)
      .lean();

    if (candidates.length === 0) return empty;

    // A generic line ("وجبة") is served by any shop, so it tells us nothing
    // about which — it is left out of the comparison and picked once the
    // customer has chosen a shop.
    const named = dto.items.filter((i) => !readGenericItem(i.name).isGeneric);

    const options: any[] = [];
    for (const doc of candidates) {
      const id = String(doc._id);
      const { has, missing } = named.length === 0 ? { has: [], missing: [] } : await this.splitByAvailability(id, named);
      options.push({
        id,
        name: doc.nameAr || doc.name,
        distanceMeters: doc.location?.coordinates
          ? Math.round(haversineMeters(dto.lat, dto.lng, doc.location.coordinates[1], doc.location.coordinates[0]))
          : null,
        has,
        missing,
      });
    }

    // $near already handed them over nearest-first, so a stable sort on
    // coverage alone leaves distance as the tie-breaker.
    options.sort((a, b) => b.has.length - a.has.length);

    return { ...empty, shopOptions: options };
  }

  /** Which of these dishes the shop serves, and which it doesn't. */
  private async splitByAvailability(businessId: string, items: { name: string }[]) {
    const catalog = await this.getCatalog(businessId);
    const candidates = [
      ...catalog.products.map((p: any) => ({ id: String(p.id), name: p.name, kind: 'product' as const, row: p })),
      ...catalog.deals.map((d: any) => ({ id: String(d.id), name: d.titleAr, kind: 'deal' as const, row: d })),
    ];
    const has: string[] = [];
    const missing: string[] = [];
    for (const item of items) {
      const closest = closestMatch(item.name, candidates);
      (closest && closest.score >= MATCH_THRESHOLD ? has : missing).push(item.name);
    }
    return { has, missing };
  }

  /**
   * Chooses a dish for a customer who named none ("بدي وصي من مطعم الماهر
   * وجبة").
   *
   * Picking at random would be as good as picking nothing, so the order is
   * by how well each reason survives being said out loud:
   *  1. **الأكثر طلباً** — what other customers actually asked this shop for.
   *     Real evidence from real requests, and the only signal here that
   *     comes from people rather than from us.
   *  2. **عليه خصم** — the shop's own best value, cheapest after discount.
   *  3. **first row** — no reason to give, so the reply claims none.
   *
   * A stated budget overrides all of it: someone who said "أرخص وجبة" asked
   * a different question, and the cheapest row answers it exactly.
   *
   * Only products, never deals: a deal is a way to buy something, not a
   * thing to eat, and it carries no unit price for the basket to total.
   */
  private pickForCustomer(
    products: any[],
    prefer: PickPreference,
    popularity: Map<string, number>,
    alreadyPicked: Set<string>,
  ): { product: any; reason: 'popular' | 'deal' | 'cheapest' | 'pick' } | null {
    // A second generic line must not land on the row the first one took.
    const pool = products.filter((p) => !alreadyPicked.has(String(p.id)));
    if (pool.length === 0) return null;

    const cheapest = () => pool.reduce((a, b) => (b.finalPrice < a.finalPrice ? b : a));

    if (prefer === 'cheapest') return { product: cheapest(), reason: 'cheapest' };

    let mostAsked: any = null;
    let mostAskedCount = 0;
    for (const product of pool) {
      const count = popularity.get(String(product.id)) ?? 0;
      if (count > mostAskedCount) {
        mostAsked = product;
        mostAskedCount = count;
      }
    }
    if (mostAsked) return { product: mostAsked, reason: 'popular' };

    const discounted = pool.filter((p) => p.finalPrice < p.price);
    if (discounted.length > 0) {
      return { product: discounted.reduce((a, b) => (b.finalPrice < a.finalPrice ? b : a)), reason: 'deal' };
    }

    return { product: pool[0], reason: 'pick' };
  }

  /**
   * آخر كتابة تحليلات معلّقة. ما ينتظرها شي في الإنتاج — وجودها للاختبارات
   * وحدها: كتابة غير منتظَرة تصل بعد تنظيف الاختبار التالي فتظهر كصفٍّ زائد
   * عنده، وهو عطل متقطّع بالاختبارات لا بالمنتج.
   */
  private gapWrite: Promise<unknown> = Promise.resolve();

  /** ينتظر استقرار كتابة التحليلات المعلّقة — للاختبارات. */
  async whenGapsWritten(): Promise<void> {
    await this.gapWrite;
  }

  /** How many times each of this shop's products has been asked for. */
  private async itemPopularity(businessId: string): Promise<Map<string, number>> {
    try {
      const rows = await this.requestModel.aggregate([
        { $match: { businessId: new Types.ObjectId(businessId) } },
        { $unwind: '$items' },
        { $match: { 'items.itemType': 'product' } },
        { $group: { _id: '$items.itemId', count: { $sum: 1 } } },
      ]);
      return new Map(rows.map((r: any) => [String(r._id), r.count as number]));
    } catch (e: any) {
      // Best effort only: an analytics query is never worth failing an order
      // over. Without it the pick falls through to the discount rule.
      console.error('[public] item popularity failed:', e?.message || e);
      return new Map();
    }
  }

  // How many nearby shops of the asked-for kind we are willing to open the
  // menu of before choosing. Each one is two more queries, and the answer
  // hardly ever improves past the first handful — the nearest shop that
  // stocks the dish is almost always within this many.
  private static readonly ORDER_SHOP_CANDIDATES = 6;
  private static readonly ORDER_SEARCH_RADIUS_METERS = 5000;


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
