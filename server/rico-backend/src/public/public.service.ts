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
