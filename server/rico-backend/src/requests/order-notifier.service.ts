import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Account, AccountDocument } from '../accounts/schemas/account.schema';
import { BusinessClaim, BusinessClaimDocument } from '../vendor/schemas/business-claim.schema';
import { MailerService } from '../mailer/mailer.service';
import { RequestItem } from './schemas/request.schema';

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
  ) {}

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
