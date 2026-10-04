import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CustomerRequest,
  CustomerRequestDocument,
  NEXT_STAGES,
  RequestItem,
  RequestStage,
} from './schemas/request.schema';
import { Business, BusinessDocument } from '../businesses/schemas/business.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Deal, DealDocument } from '../deals/schemas/deal.schema';
import { CreateRequestDto, CreateRequestItemDto } from './dto/create-request.dto';
import { CustomerDocument } from '../customers/schemas/customer.schema';
import { OrderNotifierService } from './order-notifier.service';
import { ordersPauseState } from '../businesses/orders-pause.util';

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
    private readonly orderNotifier: OrderNotifierService,
  ) {}

  // The latest new-order notification, kept so tests can wait for the email
  // that create() deliberately doesn't wait for.
  notifyWrite: Promise<unknown> = Promise.resolve();

  async create(dto: CreateRequestDto, customer?: CustomerDocument, baseUrl = 'https://app.rico-go.com') {
    const business = await this.businessModel.findById(dto.businessId).lean();
    if (!business) throw new NotFoundException({ error: 'business_not_found' });

    // Refused up front rather than saved and left unanswered: the customer
    // learns now, while they can still order somewhere else.
    const pause = ordersPauseState(business);
    if (pause) {
      throw new ConflictException({ error: 'orders_paused', resumesAt: pause.until, note: pause.note });
    }

    // A logged-in customer's own name/phone win over anything the client
    // sent: the vendor calls this number back, so it has to be the one tied
    // to a verified account, not a per-order free-text field.
    const customerName = customer ? customer.name : dto.customerName?.trim();
    const customerPhone = customer ? customer.phone : dto.customerPhone?.trim();
    if (!customerName || !customerPhone) {
      throw new BadRequestException({ error: 'customer_details_required' });
    }

    const items = await this.resolveItems(dto);
    const total = items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);

    const request = await this.requestModel.create({
      businessId: dto.businessId,
      customerId: customer?._id ?? null,
      customerName,
      customerPhone,
      items,
      total,
    });

    // Not awaited: the customer's confirmation shouldn't wait on an email
    // provider, and a failed email mustn't undo an order that's saved.
    this.notifyWrite = this.orderNotifier
      .notifyNewOrder({
        requestId: String(request._id),
        businessId: String(business._id),
        shopName: business.nameAr || business.name,
        customerName,
        customerPhone,
        items,
        total,
        baseUrl,
      })
      .catch((e) => console.error('[requests] new-order notification failed:', e?.message || e));

    return { requestId: request._id, status: request.status, itemCount: items.length, total };
  }

  // Every label, price and image is read here from the real Product/Deal, never
  // taken from the client — which also doubles as the ownership check, since a
  // line whose id doesn't belong to this business simply isn't found.
  private async resolveItems(dto: CreateRequestDto): Promise<RequestItem[]> {
    const requested = this.normalizeRequestedItems(dto);

    const idsOfType = (type: string) => requested.filter((i) => i.itemType === type).map((i) => i.itemId);
    const [products, deals] = await Promise.all([
      this.productModel.find({ _id: { $in: idsOfType('product') }, businessId: dto.businessId }).lean(),
      this.dealModel.find({ _id: { $in: idsOfType('deal') }, businessId: dto.businessId }).lean(),
    ]);

    const productById = new Map(products.map((p: any) => [String(p._id), p]));
    const dealById = new Map(deals.map((d: any) => [String(d._id), d]));

    return requested.map((line) => {
      if (line.itemType === 'product') {
        const product = productById.get(line.itemId);
        if (!product) throw new NotFoundException({ error: 'item_not_found', itemId: line.itemId });
        return {
          itemType: 'product' as const,
          itemId: product._id,
          label: product.name,
          detail: `${product.finalPrice} ر.س`,
          quantity: line.quantity,
          unitPrice: product.finalPrice,
          imageUrl: product.imageUrl ?? null,
        };
      }

      const deal = dealById.get(line.itemId);
      if (!deal) throw new NotFoundException({ error: 'item_not_found', itemId: line.itemId });
      return {
        itemType: 'deal' as const,
        itemId: deal._id,
        label: deal.titleAr,
        detail: dealDetailLabel(deal),
        quantity: line.quantity,
        unitPrice: null,
        imageUrl: null,
      };
    });
  }

  // Accepts either shape — a basket, or the single item older app builds send —
  // and collapses repeats of the same item into one line with a summed
  // quantity, so a vendor reads "3 x tea" rather than the same row three times.
  private normalizeRequestedItems(dto: CreateRequestDto): { itemType: string; itemId: string; quantity: number }[] {
    const raw: CreateRequestItemDto[] = dto.items?.length
      ? dto.items
      : dto.itemType && dto.itemId
        ? [{ itemType: dto.itemType, itemId: dto.itemId }]
        : [];

    if (raw.length === 0) throw new BadRequestException({ error: 'items_required' });

    const merged = new Map<string, { itemType: string; itemId: string; quantity: number }>();
    for (const line of raw) {
      const key = `${line.itemType}:${line.itemId}`;
      const existing = merged.get(key);
      const quantity = line.quantity ?? 1;
      if (existing) {
        existing.quantity = Math.min(99, existing.quantity + quantity);
      } else {
        merged.set(key, { itemType: line.itemType, itemId: line.itemId, quantity });
      }
    }
    return [...merged.values()];
  }

  async findForBusinesses(businessIds: string[]) {
    const requests = await this.requestModel
      .find({ businessId: { $in: businessIds } })
      .populate('businessId', 'name nameAr')
      .sort({ createdAt: -1 })
      .lean();

    return requests.map((r: any) => {
      const items = this.readItems(r);
      return {
        id: r._id,
        businessId: r.businessId?._id ?? null,
        businessName: r.businessId ? r.businessId.nameAr || r.businessId.name : null,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        items,
        total: r.total ?? items.reduce((sum: number, i: any) => sum + (i.unitPrice ?? 0) * i.quantity, 0),
        status: r.status,
        stage: this.readStage(r),
        vendorNote: r.vendorNote ?? null,
        stageUpdatedAt: r.stageUpdatedAt ?? null,
        createdAt: r.createdAt,
      };
    });
  }

  // The customer's own order history — their side of the same records the
  // vendor reads through findForBusinesses. Scoped by customerId rather than
  // by phone or email: a request placed anonymously before the customer had an
  // account isn't theirs to reopen, and matching on a phone number would let
  // anyone who reuses it inherit a stranger's history.
  async findForCustomer(customerId: string) {
    const requests = await this.requestModel
      .find({ customerId })
      .populate('businessId', 'name nameAr phone')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return requests.map((r: any) => {
      const items = this.readItems(r);
      return {
        id: r._id,
        businessId: r.businessId?._id ?? null,
        businessName: r.businessId ? r.businessId.nameAr || r.businessId.name : null,
        // So the customer can chase an order the shop hasn't called about yet.
        businessPhone: r.businessId?.phone ?? null,
        items,
        total: r.total ?? items.reduce((sum: number, i: any) => sum + (i.unitPrice ?? 0) * i.quantity, 0),
        status: r.status,
        stage: this.readStage(r),
        vendorNote: r.vendorNote ?? null,
        createdAt: r.createdAt,
      };
    });
  }

  // Requests from before stages existed only have status; one the shop marked
  // handled reads as completed, since that's all "handled" ever promised. A
  // hydrated document reports the schema default 'new' for the missing stage,
  // hence the check on the pair rather than on stage being absent — nothing
  // written today is both handled and new.
  private readStage(raw: any): RequestStage {
    if (raw.status === 'handled' && (!raw.stage || raw.stage === 'new')) return 'completed';
    return raw.stage || 'new';
  }

  // Requests predating baskets carry their single item in the legacy top-level
  // fields; they read back as a one-line basket so the dashboard needs only one
  // shape. See the note on CustomerRequest.
  private readItems(raw: any): any[] {
    if (raw.items?.length) return raw.items;
    if (!raw.itemLabel) return [];
    return [
      {
        itemType: raw.itemType,
        itemId: raw.itemId,
        label: raw.itemLabel,
        detail: raw.itemDetail ?? null,
        quantity: 1,
        unitPrice: null,
        imageUrl: null,
      },
    ];
  }

  // The original one-button flow, still called by older dashboards. It only
  // ever meant "the shop dealt with it", so it confirms a new order and leaves
  // one already further along where it is.
  async markHandled(id: string, businessIds: string[]) {
    const request = await this.requestModel.findOne({ _id: id, businessId: { $in: businessIds } });
    if (!request) throw new NotFoundException({ error: 'request_not_found' });
    if (this.readStage(request) === 'new') {
      request.stage = 'confirmed';
      request.stageUpdatedAt = new Date();
    }
    request.status = 'handled';
    await request.save();
    return { id: request._id, status: request.status, stage: request.stage };
  }

  async setStage(id: string, businessIds: string[], stage: RequestStage, note?: string | null) {
    const request = await this.requestModel.findOne({ _id: id, businessId: { $in: businessIds } });
    if (!request) throw new NotFoundException({ error: 'request_not_found' });

    const current = this.readStage(request);
    if (!NEXT_STAGES[current].includes(stage)) {
      throw new ConflictException({ error: 'invalid_stage_transition', from: current, to: stage });
    }

    request.stage = stage;
    request.stageUpdatedAt = new Date();
    request.status = 'handled';
    if (note !== undefined) request.vendorNote = note?.trim() || null;
    await request.save();
    return { id: request._id, status: request.status, stage: request.stage, vendorNote: request.vendorNote };
  }
}
