import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProfessionalRequest, ProfessionalRequestSchema } from './schemas/professional-request.schema';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalsController } from './professionals.controller';
import { CustomersModule } from '../customers/customers.module';
import { MailerModule } from '../mailer/mailer.module';
import { professionalRequestLimiter } from '../common/middleware/rate-limiters';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ProfessionalRequest.name, schema: ProfessionalRequestSchema }]),
    // For the Customer model (professionals are customers with a trade on
    // their profile) and the auth guard.
    CustomersModule,
    MailerModule,
  ],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService],
  exports: [MongooseModule, ProfessionalsService],
})
export class ProfessionalsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Each request emails a real person — capped like the other endpoints
    // that reach someone's inbox, so nobody can be spammed with leads.
    consumer
      .apply(professionalRequestLimiter)
      .forRoutes({ path: 'professionals/requests', method: RequestMethod.POST });
  }
}
