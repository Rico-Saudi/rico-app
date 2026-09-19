import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import cors from 'cors';
import { Deal, DealSchema } from './schemas/deal.schema';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { BusinessesModule } from '../businesses/businesses.module';
import { WeatherModule } from '../weather/weather.module';

@Module({
  imports: [WeatherModule, MongooseModule.forFeature([{ name: Deal.name, schema: DealSchema }]), BusinessesModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [MongooseModule, DealsService],
})
export class DealsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cors()).forRoutes({ path: 'deals', method: RequestMethod.GET });
  }
}
