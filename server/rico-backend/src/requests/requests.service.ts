import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomerRequest, CustomerRequestDocument } from './schemas/request.schema';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Deal, DealDocument } from '../deals/schemas/deal.schema';
import { CreateRequestDto } from './dto/create-request.dto';
import { CustomerDocument } from '../customers/schemas/customer.schema';

// Same wording as the Flutter Deal.typeLabel getter and the owner dashboard's
// DEAL_TYPE_LABELS — kept in sync by hand since this is the one place a deal's
// type gets summarized server-side, for the vendor's itemDetail snapshot.
function dealDetailLabel(deal: DealDocument): string {
  switch (deal.dealType) {
    case 'percent':
      return deal.value != null ? `خصم ${deal.value}٪` : 'خصم';
    case 'fixed':
      return deal.value != null ? `خصم ${deal.value} ${deal.currency}` : 'خصم';
    case 'bogo':
      return 'اشتري واحد واحصل على الثاني مجاناً';
    case 'free_item':
      return 'عنصر مجاني';
    case 'bundle':
      return 'عرض باقة';
    default:
      return 'عرض';
  }
}

@Injectable()
export class RequestsService {
  constructor(
    @InjectModel(CustomerRequest.name) private readonly requestModel: Model<CustomerRequestDocument>,
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
  ) {}

  // itemLabel/itemDetail are always derived here from the real record, never
  // taken from the client — also doubles as the ownership check (itemId must
  // actually belong to businessId).
  async create(dto: CreateRequestDto, customer?: CustomerDocument) {
    const business = await this.businessModel.findById(dto.businessId).lean();
    if (!business) throw new NotFoundException({ error: 'business_not_found' });

    // A logged-in customer's own name/phone win over anything the client
    // sent: the vendor calls this number back, so it has to be the one tied
    // to a verified account, not a per-order free-text field.
    const customerName = customer ? customer.name : dto.customerName?.trim();
    const customerPhone = customer ? customer.phone : dto.customerPhone?.trim();
    if (!customerName || !customerPhone) {
      throw new BadRequestException({ error: 'customer_details_required' });
    }

    let itemLabel: string;
    let itemDetail: string | null;

    if (dto.itemType === 'product') {
      const product = await this.productModel.findOne({ _id: dto.itemId, businessId: dto.businessId });
      if (!product) throw new NotFoundException({ error: 'item_not_found' });
      itemLabel = product.name;
      itemDetail = `${product.finalPrice} ر.س`;
    } else {
      const deal = await this.dealModel.findOne({ _id: dto.itemId, businessId: dto.businessId });
      if (!deal) throw new NotFoundException({ error: 'item_not_found' });
      itemLabel = deal.titleAr;
      itemDetail = dealDetailLabel(deal);
    }

    const request = await this.requestModel.create({
      businessId: dto.businessId,
      customerId: customer?._id ?? null,
      customerName,
      customerPhone,
      itemType: dto.itemType,
      itemId: dto.itemId,
      itemLabel,
      itemDetail,
    });

    return { requestId: request._id, status: request.status };
  }

  async findForBusinesses(businessIds: string[]) {
    const requests = await this.requestModel
      .find({ businessId: { $in: businessIds } })
      .populate('businessId', 'name nameAr')
      .sort({ createdAt: -1 })
      .lean();

    return requests.map((r: any) => ({
      id: r._id,
      businessId: r.businessId?._id ?? null,
      businessName: r.businessId ? r.businessId.nameAr || r.businessId.name : null,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      itemType: r.itemType,
      itemLabel: r.itemLabel,
      itemDetail: r.itemDetail,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async markHandled(id: string, businessIds: string[]) {
    const request = await this.requestModel.findOneAndUpdate(
      { _id: id, businessId: { $in: businessIds } },
      { $set: { status: 'handled' } },
      { new: true },
    );
    if (!request) throw new NotFoundException({ error: 'request_not_found' });
    return { id: request._id, status: request.status };
  }
}
