import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushSubscription, PushSubscriptionSchema } from './push-subscription.schema';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { Account, AccountSchema } from '../accounts/schemas/account.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushSubscription.name, schema: PushSubscriptionSchema },
      // SessionGuard re-reads the account on every request.
      { name: Account.name, schema: AccountSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
