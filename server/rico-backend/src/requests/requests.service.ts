import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CancelledBy,
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
import { PriceCalcService } from '../pricing/price-calc.service';

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

/// How long an order may sit unanswered before it is called off for the
/// customer (RequestsService.expireUnanswered). A customer who ordered dinner
/// and heard nothing for half an hour has given up — they deserve to be told
/// to try somewhere else, not to keep waiting. ORDER_RESPONSE_MINUTES
/// overrides it; 0 turns the sweep off.
const DEFAULT_ORDER_RESPONSE_MINUTES = 30;
const EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;

function orderResponseMinutes(): number {
  const raw = process.env.ORDER_RESPONSE_MINUTES;
  if (raw === undefined || raw === '') return DEFAULT_ORDER_RESPONSE_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_ORDER_RESPONSE_MINUTES;
}

@Injectable()
export class RequestsService implements OnModuleInit, OnModuleDestroy {
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(CustomerRequest.name) private readonly requestModel: Model<CustomerRequestDocument>,
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    private readonly orderNotifier: OrderNotifierService,
    // Optional so specs that only test basket rules can leave pricing out;
    // the running server always injects it.
    @Optional() private readonly priceCalc?: PriceCalcService,
  ) {}

  // The latest new-order notification, kept so tests can wait for the email
  // that create() deliberately doesn't wait for.
  notifyWrite: Promise<unknown> = Promise.resolve();

  onModuleInit(): void {
    if (orderResponseMinutes() === 0) return;
    this.sweepTimer = setInterval(() => {
      this.expireUnanswered().catch((e) => console.error('[requests] expiry sweep failed:', e?.message || e));
    }, EXPIRY_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

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
    // ALLOW_ANONYMOUS_ORDERS=false closes the old no-account path once the
    // builds that need it are gone from users' phones.
    if (!customer && process.env.ALLOW_ANONYMOUS_ORDERS === 'false') {
      throw new UnauthorizedException({ error: 'sign_in_required' });
    }

    const customerName = customer ? customer.name : dto.customerName?.trim();
    const customerPhone = customer ? customer.phone : dto.customerPhone?.trim();
    if (!customerName || !customerPhone) {
      throw new BadRequestException({ error: 'customer_details_required' });
    }

    // A retry of a tap that already went through: hand back that order.
    const clientRef = customer && dto.clientRef ? dto.clientRef : null;
    if (clientRef) {
      const existing = await this.requestModel.findOne({ customerId: customer!._id, clientRef }).lean();
      if (existing) return this.createdAnswer(existing);
    }

    const items = await this.resolveItems(dto);
    const total = items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);

    let request: CustomerRequestDocument;
    try {
      request = await this.requestModel.create({
        businessId: dto.businessId,
        customerId: customer?._id ?? null,
        customerName,
        customerPhone,
        items,
        total,
        clientRef,
      });
    } catch (e) {
      // Two copies of the same tap racing: the unique index let one in.
      if (clientRef && (e as { code?: number }).code === 11000) {
        const existing = await this.requestModel.findOne({ customerId: customer!._id, clientRef }).lean();
        if (existing) return this.createdAnswer(existing);
      }
      throw e;
    }

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

    return this.createdAnswer(request);
  }

  private createdAnswer(request: { _id: unknown; status: string; items: unknown[]; total: number }) {
    return { requestId: request._id, status: request.status, itemCount: request.items.length, total: request.total };
  }

  /// The customer calls off their own order — only while the shop hasn't
  /// picked it up. Once confirmed the shop may already be cooking it, and
  /// the customer is told to call the shop instead.
  async cancelByCustomer(id: string, customerId: string) {
    const request = await this.requestModel.findOne({ _id: id, customerId });
    if (!request) throw new NotFoundException({ error: 'request_not_found' });
    const current = this.readStage(request);
    if (current !== 'new') throw new ConflictException({ error: 'too_late_to_cancel', stage: current });

    request.stage = 'cancelled';
    request.cancelledBy = 'customer';
    request.stageUpdatedAt = new Date();
    // Off the shop's "new" count: nothing is waiting for them any more.
    request.status = 'handled';
    await request.save();
    return { id: request._id, stage: request.stage, cancelledBy: request.cancelledBy };
  }

  /// The customer rates an order they got. Only once the shop took it on —
  /// a rating for an order nobody answered is a rating of Rico's timeout,
  /// not of the shop. Re-rating replaces the earlier verdict.
  async rate(id: string, customerId: string, stars: number, comment?: string) {
    const request = await this.requestModel.findOne({ _id: id, customerId });
    if (!request) throw new NotFoundException({ error: 'request_not_found' });
    const stage = this.readStage(request);
    if (stage === 'new' || stage === 'cancelled') throw new ConflictException({ error: 'not_rateable', stage });

    request.rating = { stars, comment: comment?.trim() || null, ratedAt: new Date() };
    await request.save();
    await this.rollUpRating(String(request.businessId));
    return { id: request._id, rating: request.rating };
  }

  /// Recomputes the shop's average from every rated order — cheap at this
  /// scale, and it can't drift the way an incremental average does.
  private async rollUpRating(businessId: string): Promise<void> {
    const [agg] = await this.requestModel.aggregate<{ avg: number; count: number }>([
      { $match: { businessId: new Types.ObjectId(businessId), 'rating.stars': { $gte: 1 } } },
      { $group: { _id: null, avg: { $avg: '$rating.stars' }, count: { $sum: 1 } } },
    ]);
    await this.businessModel.updateOne(
      { _id: businessId },
      { $set: { ricoRatingAvg: agg ? Math.round(agg.avg * 10) / 10 : null, ricoRatingCount: agg?.count ?? 0 } },
    );
  }

  /// Calls off orders nobody answered in time, and tells their customers.
  /// Conditional on stage 'new' in the update itself, so an order the shop
  /// confirms in the same second is never cancelled under it.
  async expireUnanswered(now = new Date()): Promise<number> {
    const minutes = orderResponseMinutes();
    if (minutes === 0) return 0;
    const cutoff = new Date(now.getTime() - minutes * 60_000);
    const stale = await this.requestModel
      .find({ stage: 'new', status: 'new', createdAt: { $lt: cutoff } }, '_id')
      .limit(200)
      .lean();

    let expired = 0;
    for (const { _id } of stale) {
      const request = await this.requestModel
        .findOneAndUpdate(
          { _id, stage: 'new', status: 'new' },
          { $set: { stage: 'cancelled', cancelledBy: 'timeout', status: 'handled', stageUpdatedAt: now } },
          { new: true },
        )
        .populate('businessId', 'name nameAr')
        .lean();
      if (!request) continue;
      expired++;
      this.notifyStage(request as any, null);
    }
    return expired;
  }

  private notifyStage(request: any, note: string | null): void {
    const business = request.businessId;
    this.notifyWrite = this.orderNotifier
      .notifyCustomerStage({
        requestId: String(request._id),
        customerId: request.customerId ? String(request.customerId) : null,
        shopName: business?.nameAr || business?.name || 'المحل',
        stage: request.stage,
        cancelledBy: (request.cancelledBy ?? null) as CancelledBy | null,
        note,
      })
      .catch(() => false);
  }

  // Every label, price and image is read here from the real Product/Deal, never
  // taken from the client — which also doubles as the ownership check, since a
  // line whose id doesn't belong to this business simply isn't found.
  private async resolveItems(dto: CreateRequestDto): Promise<RequestItem[]> {
    const requested = this.normalizeRequestedItems(dto);

    const idsOfType = (type: string) => requested.filter((i) => i.itemType === type).map((i) => i.itemId);
    // A discount that ended (or started) by date alone leaves a stale
    // finalPrice until something writes to the product — refresh exactly the
    // lines being bought, so the total is what the price is right now.
    await this.priceCalc?.recomputeForProducts(idsOfType('product'));
    // Only what a customer could actually see: a soft-deleted product, or a
    // deal still waiting for review, rejected or past its end, is "not found"
    // rather than orderable by anyone who kept its id.
    const now = new Date();
    const [products, deals] = await Promise.all([
      this.productModel.find({ _id: { $in: idsOfType('product') }, businessId: dto.businessId, isActive: { $ne: false } }).lean(),
      this.dealModel
        .find({
          _id: { $in: idsOfType('deal') },
          businessId: dto.businessId,
          status: 'active',
          $and: [
            { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
            { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
          ],
        })
        .lean(),
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
        // False for an order from an app build without accounts: the name and
        // number were typed, not verified, and the shop should know that
        // before it starts cooking.
        verified: Boolean(r.customerId),
        items,
        total: r.total ?? items.reduce((sum: number, i: any) => sum + (i.unitPrice ?? 0) * i.quantity, 0),
        status: r.status,
        stage: this.readStage(r),
        cancelledBy: r.cancelledBy ?? null,
        vendorNote: r.vendorNote ?? null,
        stageUpdatedAt: r.stageUpdatedAt ?? null,
        rating: r.rating ?? null,
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
        cancelledBy: r.cancelledBy ?? null,
        vendorNote: r.vendorNote ?? null,
        stageUpdatedAt: r.stageUpdatedAt ?? null,
        rating: r.rating ?? null,
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
    if (stage === 'cancelled') request.cancelledBy = 'shop';
    if (note !== undefined) request.vendorNote = note?.trim() || null;
    await request.save();

    // Not awaited, same as the new-order email: the vendor's click
    // shouldn't wait on an email provider.
    const populated = await request.populate('businessId', 'name nameAr');
    this.notifyStage(populated.toObject(), request.vendorNote ?? null);

    return { id: request._id, status: request.status, stage: request.stage, vendorNote: request.vendorNote };
  }
}
