import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import cors from 'cors';
import { ClassifyService } from './classify.service';
import { ClassifyController } from './classify.controller';
import { LlmModule } from '../llm/llm.module';
import { LearningModule } from '../learning/learning.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Business, BusinessSchema } from '../businesses/schemas/business.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { ShopNamesService } from './shop-names.service';

@Module({
  imports: [
    LlmModule,
    LearningModule,
    MongooseModule.forFeature([
      { name: Business.name, schema: BusinessSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [ClassifyController],
  providers: [ClassifyService, ShopNamesService],
})
export class ClassifyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(cors()).forRoutes({ path: 'classify', method: RequestMethod.POST });
  }
}
