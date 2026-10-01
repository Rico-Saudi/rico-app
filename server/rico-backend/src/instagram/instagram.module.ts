import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InstagramConnection, InstagramConnectionSchema } from './schemas/instagram-connection.schema';
import { InstagramService } from './instagram.service';
import { InstagramController } from './instagram.controller';
import { VendorModule } from '../vendor/vendor.module';
import { DealsModule } from '../deals/deals.module';
import { AccountsModule } from '../accounts/accounts.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InstagramConnection.name, schema: InstagramConnectionSchema }]),
    // Brings the BusinessClaim model, which is how ownership is proven.
    VendorModule,
    DealsModule,
    AccountsModule,
    LlmModule,
  ],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
