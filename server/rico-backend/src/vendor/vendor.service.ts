import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { BusinessClaim, BusinessClaimDocument } from './schemas/business-claim.schema';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { Deal, DealDocument } from '../deals/schemas/deal.schema';
import { CreateOwnDealDto } from './dto/create-own-deal.dto';
import { UpdateOwnDealDto } from './dto/update-own-deal.dto';
import { BusinessesService } from '../businesses/businesses.service';
import { ProductsService } from '../products/products.service';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { UpdateProductDto } from '../products/dto/update-product.dto';
import { DiscountsService } from '../discounts/discounts.service';
import { CreateDiscountDto } from '../discounts/dto/create-discount.dto';
import { UpdateDiscountDto } from '../discounts/dto/update-discount.dto';
import { RequestsService } from '../requests/requests.service';
import { PriceCalcService } from '../pricing/price-calc.service';
import { BulkProductRow } from '../products/products.service';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { CustomerRequest, CustomerRequestDocument } from '../requests/schemas/request.schema';
import { VendorImpression, VendorImpressionDocument } from '../public/schemas/vendor-impression.schema';
import { CatalogGap, CatalogGapDocument } from '../public/schemas/catalog-gap.schema';
import { ListOwnProductsDto } from './dto/list-own-products.dto';
import { BulkProductsDto } from './dto/bulk-products.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { UpdateRequestStageDto } from './dto/update-request-stage.dto';
import { VendorStatsDto } from './dto/vendor-stats.dto';
import { verticalFor } from './constants/verticals';

// Every shop on Rico today is in Saudi Arabia or Jordan, both UTC+3 all year,
// so "a day" in the vendor's charts is a Riyadh day.
const STATS_TIMEZONE = 'Asia/Riyadh';
const STATS_UTC_OFFSET = '+03:00';

function dayKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: STATS_TIMEZONE });
}

// A product's attributes are whatever its vertical's form asks for — a
// pharmacy's active ingredient, a barber's session length. Free-form on
// purpose, so only the shape is policed: short keys, scalar values, a cap
// on how many, and blanks dropped rather than stored.
const ATTRIBUTE_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const MAX_ATTRIBUTES = 20;

export function sanitizeAttributes(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(clean).length >= MAX_ATTRIBUTES) break;
    if (!ATTRIBUTE_KEY.test(key)) continue;
    if (typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'string' && value.trim()) clean[key] = value.trim().slice(0, 200);
  }
  return clean;
}

type BulkRowResult = { ok: true; row: BulkProductRow } | { ok: false; error: string };

// Spreadsheet cells come in as strings, numbers or nothing, under whatever
// names the client mapped its columns to.
function readBulkRow(input: unknown): BulkRowResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid_row' };
  const raw = input as Record<string, unknown>;
  const text = (v: unknown, max: number): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
  };

  const name = text(raw.name, 200);
  if (!name) return { ok: false, error: 'name_required' };

  const price = typeof raw.price === 'number' ? raw.price : Number(String(raw.price ?? '').replace(/,/g, '').trim());
  if (raw.price === undefined || raw.price === '' || !Number.isFinite(price) || price < 0) {
    return { ok: false, error: 'invalid_price' };
  }

  let keywords: string[] | undefined;
  if (Array.isArray(raw.keywords)) keywords = raw.keywords.map((k) => String(k).trim()).filter(Boolean);
  else if (typeof raw.keywords === 'string') {
    keywords = raw.keywords
      .split(/[,،]/)
      .map((k) => k.trim())
      .filter(Boolean);
  }

  let inStock: boolean | undefined;
  if (typeof raw.inStock === 'boolean') inStock = raw.inStock;
  else if (typeof raw.inStock === 'string' && raw.inStock.trim()) {
    inStock = !['0', 'false', 'no', 'لا', 'غير متوفر', 'نفد'].includes(raw.inStock.trim().toLowerCase());
  }

  return {
    ok: true,
    row: {
      name,
      price: Math.round(price * 100) / 100,
      category: text(raw.category, 80),
      unit: text(raw.unit, 30),
      brand: text(raw.brand, 80),
      sku: text(raw.sku, 64),
      keywords,
      inStock,
    },
  };
}

@Injectable()
export class VendorService {
  constructor(
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    @InjectModel(BusinessClaim.name) private readonly claimModel: Model<BusinessClaimDocument>,
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    private readonly businessesService: BusinessesService,
    private readonly productsService: ProductsService,
    private readonly discountsService: DiscountsService,
    private readonly requestsService: RequestsService,
    private readonly priceCalcService: PriceCalcService,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(CustomerRequest.name) private readonly requestModel: Model<CustomerRequestDocument>,
    @InjectModel(VendorImpression.name) private readonly impressionModel: Model<VendorImpressionDocument>,
    @InjectModel(CatalogGap.name) private readonly catalogGapModel: Model<CatalogGapDocument>,
  ) {}

  async me(accountId: string) {
    const account = await this.accountModel.findById(accountId).lean();
    if (!account) throw new UnauthorizedException({ error: 'unauthorized' });

    const claims = await this.claimModel
      .find({ accountId: account._id })
      .populate('businessId', 'name nameAr categorySlug imageUrl phone openingHours address district city')
      .lean();

    return {
      email: account.email,
      claims: claims.map((c: any) => ({
        placeId: c.businessId._id,
        placeName: c.businessId.nameAr || c.businessId.name,
        categorySlug: c.businessId.categorySlug,
        // Which wording, units and product fields the dashboard uses for this
        // shop — see constants/verticals.ts.
        vertical: verticalFor(c.businessId.categorySlug),
        phone: c.businessId.phone ?? null,
        openingHours: c.businessId.openingHours ?? null,
        address: c.businessId.address ?? null,
        district: c.businessId.district ?? null,
        city: c.businessId.city ?? null,
        // Lets the dashboard show the storefront photo the vendor already has
        // (or that they have none) without a second round-trip per business.
        imageUrl: c.businessId.imageUrl ?? null,
        status: c.status,
      })),
    };
  }

  // Self-serve claim path — for a vendor requesting an *additional* business
  // beyond the one their owner-invite pre-assigned. Always lands in
  // pending_review; only the owner moderation queue can activate it (see
  // OwnerService.reviewClaimStatus). A previously rejected/suspended claim
  // can be re-submitted rather than being permanently stuck.
  async claimBusiness(accountId: string, businessId: string) {
    const business = businessId ? await this.businessModel.findById(businessId).lean() : null;
    if (!business) throw new NotFoundException({ error: 'place_not_found' });

    const existing = await this.claimModel.findOne({ accountId, businessId });
    if (existing) {
      if (existing.status === 'rejected' || existing.status === 'suspended') {
        existing.status = 'pending_review';
        await existing.save();
        return { claimId: existing._id, status: existing.status };
      }
      throw new ConflictException({ error: 'already_claimed', status: existing.status });
    }

    const claim = await this.claimModel.create({ accountId, businessId });
    return { claimId: claim._id, status: claim.status };
  }

  private async activeBusinessIdsForAccount(accountId: string): Promise<string[]> {
    const claims = await this.claimModel.find({ accountId, status: 'active' }).lean();
    return claims.map((c) => String(c.businessId));
  }

  async listOwnDeals(accountId: string) {
    const businessIds = await this.activeBusinessIdsForAccount(accountId);
    const deals = await this.dealModel
      .find({ ownerAccountId: accountId, businessId: { $in: businessIds } })
      .sort({ createdAt: -1 })
      .lean();

    return {
      deals: deals.map((d) => ({
        id: d._id,
        placeId: d.businessId,
        titleAr: d.titleAr,
        descriptionAr: d.descriptionAr,
        dealType: d.dealType,
        value: d.value,
        promoCode: d.promoCode,
        status: d.status,
      })),
    };
  }

  async createOwnDeal(accountId: string, dto: CreateOwnDealDto) {
    // Ownership check (IDOR guard): the business must be one of THIS
    // account's *active* (owner-approved) claims — not just any business
    // that exists.
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(dto.businessId)) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }

    const deal = await this.dealModel.create({
      businessId: dto.businessId,
      titleAr: dto.titleAr.trim(),
      descriptionAr: dto.descriptionAr?.trim() ?? null,
      dealType: dto.dealType,
      value: dto.value ?? null,
      promoCode: dto.promoCode?.trim() ?? null,
      weatherConditions: dto.weatherConditions?.length ? dto.weatherConditions : null,
      status: 'active', // auto-published — the claim review is the trust gate, not each deal
      source: 'business_dashboard',
      ownerAccountId: accountId,
      verifiedAt: new Date(),
    });

    return { dealId: deal._id };
  }

  async updateOwnDeal(accountId: string, dealId: string, dto: UpdateOwnDealDto) {
    // `ownerAccountId: accountId` in the filter guarantees this account
    // authored the deal, but not that its claim on that business is still
    // active — a suspended/rejected claim should also lock out editing the
    // deal's text, matching the "revoked trust" model everywhere else in
    // this service.
    const existing = await this.dealModel.findOne({ _id: dealId, ownerAccountId: accountId }).lean();
    if (!existing) throw new NotFoundException({ error: 'deal_not_found' });

    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(String(existing.businessId))) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }

    const deal = await this.dealModel.findOneAndUpdate(
      { _id: dealId, ownerAccountId: accountId },
      {
        $set: {
          ...(dto.titleAr !== undefined ? { titleAr: dto.titleAr.trim() } : {}),
          ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr.trim() } : {}),
          ...(dto.status === 'expired' ? { status: 'expired' } : {}),
        },
      },
      { new: true },
    );

    if (!deal) throw new NotFoundException({ error: 'deal_not_found' });
    return { dealId: deal._id, status: deal.status };
  }

  async listOwnProducts(accountId: string, query: ListOwnProductsDto) {
    await this.assertOwnsBusiness(accountId, query.businessId);
    return this.productsService.findForVendor(query);
  }

  async createOwnProduct(accountId: string, dto: CreateProductDto) {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(dto.businessId)) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
    return this.productsService.create({ ...dto, attributes: sanitizeAttributes(dto.attributes) });
  }

  async updateOwnProduct(accountId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.productsService.findOne(productId);
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(String(product.businessId))) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
    // businessId is part of the create DTO the update one extends; a product
    // can't be moved to another shop by editing it.
    const { businessId: _ignored, ...changes } = dto;
    const updated = await this.productsService.update(productId, {
      ...changes,
      ...(changes.attributes !== undefined ? { attributes: sanitizeAttributes(changes.attributes) } : {}),
    });
    // update() resets finalPrice to the new price; a product on discount gets
    // its discounted price back here instead of silently losing it.
    if (changes.price !== undefined) {
      await this.priceCalcService.recomputeForProduct(productId);
      return this.productsService.findOne(productId);
    }
    return updated;
  }

  async bulkUpsertOwnProducts(accountId: string, dto: BulkProductsDto) {
    await this.assertOwnsBusiness(accountId, dto.businessId);

    const valid: BulkProductRow[] = [];
    const failed: { index: number; name: string | null; error: string }[] = [];
    dto.rows.forEach((raw, index) => {
      const result = readBulkRow(raw);
      if (result.ok) valid.push(result.row);
      else failed.push({ index, name: typeof (raw as any)?.name === 'string' ? (raw as any).name : null, error: result.error });
    });

    const result = valid.length
      ? await this.productsService.bulkUpsert(dto.businessId, valid)
      : { created: 0, updated: 0, repricedIds: [] };
    for (const id of result.repricedIds) await this.priceCalcService.recomputeForProduct(id);

    return { created: result.created, updated: result.updated, failed };
  }

  async updateOwnPlace(accountId: string, businessId: string, dto: UpdatePlaceDto) {
    await this.assertOwnsBusiness(accountId, businessId);
    const set: Record<string, string | null> = {};
    for (const key of ['phone', 'openingHours', 'address', 'district'] as const) {
      if (dto[key] !== undefined) set[key] = dto[key]!.trim() || null;
    }
    const business = await this.businessModel
      .findByIdAndUpdate(businessId, { $set: set }, { new: true })
      .select('phone openingHours address district')
      .lean();
    if (!business) throw new NotFoundException({ error: 'place_not_found' });
    return {
      placeId: business._id,
      phone: business.phone ?? null,
      openingHours: business.openingHours ?? null,
      address: business.address ?? null,
      district: business.district ?? null,
    };
  }

  async removeOwnProduct(accountId: string, productId: string) {
    const product = await this.productsService.findOne(productId);
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(String(product.businessId))) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
    await this.productsService.remove(productId);
    return { ok: true };
  }

  async setOwnProductImage(accountId: string, productId: string, image?: Express.Multer.File) {
    await this.assertOwnsProduct(accountId, productId);
    const product = await this.productsService.setImage(productId, image);
    return { productId: product._id, imageUrl: product.imageUrl };
  }

  async removeOwnProductImage(accountId: string, productId: string) {
    await this.assertOwnsProduct(accountId, productId);
    const product = await this.productsService.clearImage(productId);
    return { productId: product._id, imageUrl: product.imageUrl };
  }

  async setOwnBusinessImage(accountId: string, businessId: string, image?: Express.Multer.File) {
    await this.assertOwnsBusiness(accountId, businessId);
    const business = await this.businessesService.setImage(businessId, image);
    return { placeId: business._id, imageUrl: business.imageUrl };
  }

  async removeOwnBusinessImage(accountId: string, businessId: string) {
    await this.assertOwnsBusiness(accountId, businessId);
    const business = await this.businessesService.clearImage(businessId);
    return { placeId: business._id, imageUrl: business.imageUrl };
  }

  /// A vendor may only touch a business they hold an active claim on — the
  /// same rule assertOwnsProduct enforces one level down.
  private async assertOwnsBusiness(accountId: string, businessId: string): Promise<void> {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(String(businessId))) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
  }

  private async assertOwnsProduct(accountId: string, productId: string): Promise<void> {
    const product = await this.productsService.findOne(productId);
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(String(product.businessId))) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
  }

  async listOwnDiscounts(accountId: string, productId: string) {
    await this.assertOwnsProduct(accountId, productId);
    return this.discountsService.findAll(productId);
  }

  async createOwnDiscount(accountId: string, dto: CreateDiscountDto) {
    await this.assertOwnsProduct(accountId, dto.productId);
    return this.discountsService.create(dto);
  }

  async updateOwnDiscount(accountId: string, discountId: string, dto: UpdateDiscountDto) {
    const discount = await this.discountsService.findOne(discountId);
    await this.assertOwnsProduct(accountId, String(discount.productId));
    return this.discountsService.update(discountId, dto);
  }

  async expireOwnDiscount(accountId: string, discountId: string) {
    const discount = await this.discountsService.findOne(discountId);
    await this.assertOwnsProduct(accountId, String(discount.productId));
    return this.discountsService.expire(discountId);
  }

  // Requests scope by *active* claims only — same visibility rule as
  // products/discounts above, not by who happened to create the item.
  async listOwnRequests(accountId: string) {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    return { requests: await this.requestsService.findForBusinesses(activeBusinessIds) };
  }

  async markOwnRequestHandled(accountId: string, requestId: string) {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    return this.requestsService.markHandled(requestId, activeBusinessIds);
  }

  async setOwnRequestStage(accountId: string, requestId: string, dto: UpdateRequestStageDto) {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    return this.requestsService.setStage(requestId, activeBusinessIds, dto.stage, dto.note);
  }

  // One read for the overview tab: how often the shop was shown, what it was
  // asked for, what it sold, what its catalogue is missing. Scoped to one
  // business, or to all of the account's active ones added together.
  async getStats(accountId: string, query: VendorStatsDto) {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (query.businessId && !activeBusinessIds.includes(query.businessId)) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
    const ids = query.businessId ? [query.businessId] : activeBusinessIds;
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const days = query.days ?? 30;

    const dayKeys: string[] = [];
    for (let i = days - 1; i >= 0; i--) dayKeys.push(dayKey(new Date(Date.now() - i * 86_400_000)));
    const since = new Date(`${dayKeys[0]}T00:00:00${STATS_UTC_OFFSET}`);
    const byDay = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: STATS_TIMEZONE } };

    // Same rule as RequestsService.readStage, in aggregation form: a request
    // handled before stages existed counts as completed.
    const stageExpr = {
      $cond: [
        { $and: [{ $eq: ['$status', 'handled'] }, { $in: [{ $ifNull: ['$stage', 'new'] }, ['new']] }] },
        'completed',
        { $ifNull: ['$stage', 'new'] },
      ],
    };

    const [impressionRows, requestFacets, waiting, catalogFacets, gapRows] = await Promise.all([
      this.impressionModel.aggregate([
        { $match: { businessId: { $in: objectIds }, createdAt: { $gte: since } } },
        { $group: { _id: byDay, count: { $sum: 1 } } },
      ]),
      this.requestModel.aggregate([
        { $match: { businessId: { $in: objectIds }, createdAt: { $gte: since } } },
        { $addFields: { effectiveStage: stageExpr } },
        {
          $facet: {
            daily: [{ $group: { _id: byDay, count: { $sum: 1 } } }],
            byStage: [{ $group: { _id: '$effectiveStage', count: { $sum: 1 }, value: { $sum: '$total' } } }],
            topItems: [
              { $match: { effectiveStage: { $ne: 'cancelled' } } },
              { $unwind: '$items' },
              {
                $group: {
                  _id: '$items.label',
                  quantity: { $sum: '$items.quantity' },
                  orders: { $sum: 1 },
                  imageUrl: { $last: '$items.imageUrl' },
                },
              },
              { $sort: { quantity: -1, orders: -1 } },
              { $limit: 8 },
            ],
          },
        },
      ]),
      // Waiting on the shop regardless of the chosen window — an order from
      // five weeks ago that nobody answered is still a customer waiting.
      this.requestModel.countDocuments({ businessId: { $in: objectIds }, status: 'new' }),
      this.productModel.aggregate([
        { $match: { businessId: { $in: objectIds }, isActive: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            outOfStock: { $sum: { $cond: [{ $eq: ['$inStock', false] }, 1, 0] } },
            withoutImage: { $sum: { $cond: [{ $ifNull: ['$imageUrl', false] }, 0, 1] } },
            withoutCategory: { $sum: { $cond: [{ $ifNull: ['$category', false] }, 0, 1] } },
          },
        },
      ]),
      this.catalogGapModel.aggregate([
        { $match: { businessId: { $in: ids }, createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$requestedItem',
            count: { $sum: 1 },
            nearestLabel: { $last: '$nearestLabel' },
            lastAskedAt: { $max: '$createdAt' },
          },
        },
        { $sort: { count: -1, lastAskedAt: -1 } },
        { $limit: 30 },
      ]),
    ]);

    // A gap the shop has since filled by adding that exact item is no longer
    // a gap; dropping it here saves the vendor re-reading their own fix.
    const listed = gapRows.length
      ? await this.productModel
          .find({ businessId: { $in: objectIds }, isActive: true, name: { $in: gapRows.map((r: any) => r._id) } }, 'name')
          .collation({ locale: 'en', strength: 2 })
          .lean()
      : [];
    const listedNames = new Set(listed.map((p) => p.name.trim().toLowerCase()));

    const fill = (rows: { _id: string; count: number }[]) => {
      const counts = new Map(rows.map((r) => [r._id, r.count]));
      return dayKeys.map((date) => ({ date, count: counts.get(date) ?? 0 }));
    };

    const facets = requestFacets[0] ?? { daily: [], byStage: [], topItems: [] };
    const byStage: Record<string, number> = { new: 0, confirmed: 0, ready: 0, completed: 0, cancelled: 0 };
    let completedValue = 0;
    for (const row of facets.byStage) {
      byStage[row._id] = row.count;
      if (row._id === 'completed') completedValue = row.value;
    }
    const requestsTotal = Object.values(byStage).reduce((a, b) => a + b, 0);
    const impressionsDaily = fill(impressionRows);
    const impressionsTotal = impressionsDaily.reduce((a, d) => a + d.count, 0);
    const catalog = catalogFacets[0] ?? { total: 0, outOfStock: 0, withoutImage: 0, withoutCategory: 0 };

    return {
      days,
      impressions: { total: impressionsTotal, daily: impressionsDaily },
      requests: {
        total: requestsTotal,
        waiting,
        byStage,
        completedValue: Math.round(completedValue * 100) / 100,
        daily: fill(facets.daily),
      },
      topItems: facets.topItems.map((r: any) => ({
        label: r._id,
        quantity: r.quantity,
        orders: r.orders,
        imageUrl: r.imageUrl ?? null,
      })),
      catalog: {
        total: catalog.total,
        outOfStock: catalog.outOfStock,
        withoutImage: catalog.withoutImage,
        withoutCategory: catalog.withoutCategory,
      },
      gaps: gapRows
        .filter((r: any) => !listedNames.has(String(r._id).trim().toLowerCase()))
        .slice(0, 15)
        .map((r: any) => ({
          requestedItem: r._id,
          count: r.count,
          nearestLabel: r.nearestLabel ?? null,
          lastAskedAt: r.lastAskedAt,
        })),
    };
  }
}
