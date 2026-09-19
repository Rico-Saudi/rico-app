import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
  ) {}

  async me(accountId: string) {
    const account = await this.accountModel.findById(accountId).lean();
    if (!account) throw new UnauthorizedException({ error: 'unauthorized' });

    const claims = await this.claimModel
      .find({ accountId: account._id })
      .populate('businessId', 'name nameAr categorySlug imageUrl')
      .lean();

    return {
      email: account.email,
      claims: claims.map((c: any) => ({
        placeId: c.businessId._id,
        placeName: c.businessId.nameAr || c.businessId.name,
        categorySlug: c.businessId.categorySlug,
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

  async listOwnProducts(accountId: string, businessId: string) {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(businessId)) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
    return this.productsService.findAll({ businessId, page: 1, limit: 100 });
  }

  async createOwnProduct(accountId: string, dto: CreateProductDto) {
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(dto.businessId)) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
    return this.productsService.create(dto);
  }

  async updateOwnProduct(accountId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.productsService.findOne(productId);
    const activeBusinessIds = await this.activeBusinessIdsForAccount(accountId);
    if (!activeBusinessIds.includes(String(product.businessId))) {
      throw new ForbiddenException({ error: 'place_not_claimed' });
    }
    return this.productsService.update(productId, dto);
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
}
