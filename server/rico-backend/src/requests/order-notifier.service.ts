import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { BusinessClaim, BusinessClaimDocument } from '../vendor/schemas/business-claim.schema';
import { MailerService } from '../mailer/mailer.service';
import { CancelledBy, RequestItem, RequestStage } from './schemas/request.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';

export interface StageNotice {
  requestId: string;
  customerId: string | null;
  shopName: string;
  stage: RequestStage;
  cancelledBy: CancelledBy | null;
  note: string | null;
}

/// What the customer is told for each step. 'new' never reaches here, and
/// 'completed' is the customer's own pickup — telling them is noise.
function stageCopy(stage: RequestStage, cancelledBy: CancelledBy | null): { headline: string; detail: string } | null {
  switch (stage) {
    case 'confirmed':
      return { headline: 'المحل أكّد طلبك ✅', detail: 'المحل شاف طلبك وبدأ يجهّزه، وبيتواصل معك على رقمك.' };
    case 'ready':
      return { headline: 'طلبك جاهز 🎉', detail: 'طلبك جاهز للاستلام أو بالطريق لك.' };
    case 'cancelled':
      if (cancelledBy === 'timeout') {
        return { headline: 'المحل ما رد على طلبك', detail: 'ما وصلنا رد من المحل بالوقت، فلغينا الطلب عشان ما تنتظر. جرّب محل ثاني من التطبيق.' };
      }
      if (cancelledBy === 'customer') return null;
      return { headline: 'المحل اعتذر عن طلبك', detail: 'المحل ما يقدر يجهّز طلبك هالمرة. جرّب محل ثاني من التطبيق.' };
    default:
      return null;
  }
}

export interface NewOrderNotice {
  requestId: string;
  businessId: string;
  shopName: string;
  customerName: string;
  customerPhone: string;
  items: RequestItem[];
  total: number;
  // Where the dashboard lives — the host the order came in on, the same way
  // vendor invite links are built.
  baseUrl: string;
}

// Tells the people running a shop that it has a new order. Everyone with an
// active claim on the business hears about it, unless they switched order
// emails off; a suspended or pending claim doesn't, for the same reason it
// can't see the order on the dashboard.
@Injectable()
export class OrderNotifierService {
  constructor(
    @InjectModel(BusinessClaim.name) private readonly claimModel: Model<BusinessClaimDocument>,
    @InjectModel(Account.name) private readonly accountModel: Model<AccountDocument>,
    private readonly mailer: MailerService,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {}

  // Tells the customer their order moved. Anonymous orders (no account) have
  // no address to write to; a customer cancelling their own order already
  // knows. Returns whether an email went out; never throws.
  async notifyCustomerStage(notice: StageNotice): Promise<boolean> {
    const copy = stageCopy(notice.stage, notice.cancelledBy);
    if (!copy || !notice.customerId) return false;
    try {
      const customer = await this.customerModel.findById(notice.customerId, 'email name emailVerified isActive').lean();
      if (!customer?.email || !customer.emailVerified || customer.isActive === false) return false;
      await this.mailer.sendOrderStatusEmail({
        to: customer.email,
        customerName: customer.name,
        shopName: notice.shopName,
        reference: notice.requestId.slice(-6).toUpperCase(),
        ...copy,
        note: notice.note,
      });
      return true;
    } catch (e) {
      console.error('[requests] status email failed:', (e as Error)?.message || e);
      return false;
    }
  }

  // Returns how many emails went out. One recipient failing doesn't stop
  // the others.
  async notifyNewOrder(notice: NewOrderNotice): Promise<number> {
    const claims = await this.claimModel.find({ businessId: notice.businessId, status: 'active' }, 'accountId').lean();
    if (claims.length === 0) return 0;
    const accounts = await this.accountModel
      .find({ _id: { $in: claims.map((c) => c.accountId) }, app: 'vendor', isActive: true, orderEmails: { $ne: false } }, 'email')
      .lean();

    const reference = notice.requestId.slice(-6).toUpperCase();
    let sent = 0;
    for (const account of accounts) {
      try {
        await this.mailer.sendNewOrderEmail({
          to: account.email,
          shopName: notice.shopName,
          reference,
          customerName: notice.customerName,
          customerPhone: notice.customerPhone,
          items: notice.items.map((i) => ({ label: i.label, quantity: i.quantity })),
          total: notice.total,
          dashboardUrl: `${notice.baseUrl}/vendor/dashboard?tab=requests`,
        });
        sent++;
      } catch (e) {
        console.error('[requests] new-order email failed:', (e as Error)?.message || e);
      }
    }
    return sent;
  }
}
