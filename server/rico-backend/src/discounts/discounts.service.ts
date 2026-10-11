import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Discount, DiscountDocument } from './schemas/discount.schema';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { PriceCalcService } from '../pricing/price-calc.service';

@Injectable()
export class DiscountsService {
  constructor(
    @InjectModel(Discount.name) private readonly discountModel: Model<DiscountDocument>,
    private readonly priceCalcService: PriceCalcService,
  ) {}

  async create(dto: CreateDiscountDto): Promise<DiscountDocument> {
    const discount = await this.discountModel.create({
      productId: dto.productId,
      type: dto.type,
      value: dto.value,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
    });
    await this.priceCalcService.recomputeForProduct(dto.productId);
    return discount;
  }

  async findAll(productId?: string) {
    const filter: Record<string, unknown> = {};
    if (productId) filter.productId = productId;
    return this.discountModel.find(filter).lean();
  }

  async findOne(id: string): Promise<DiscountDocument> {
    const discount = await this.discountModel.findById(id);
    if (!discount) throw new NotFoundException({ error: 'discount_not_found' });
    return discount;
  }

  async update(id: string, dto: UpdateDiscountDto): Promise<DiscountDocument> {
    const discount = await this.findOne(id);
    if (dto.type !== undefined) discount.type = dto.type;
    if (dto.value !== undefined) discount.value = dto.value;
    if (dto.startDate !== undefined) discount.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) discount.endDate = new Date(dto.endDate);
    if (dto.isActive !== undefined) discount.isActive = dto.isActive;
    await discount.save();
    await this.priceCalcService.recomputeForProduct(String(discount.productId));
    return discount;
  }

  // "Expire" — the simplest correct way to end a discount early without a
  // scheduled job: flip isActive and immediately recompute the product's
  // finalPrice (read-time recompute for the natural startDate/endDate
  // window already handles the rest, since recomputeForProduct re-checks
  // both dates on every write anyway).
  async expire(id: string): Promise<DiscountDocument> {
    const discount = await this.findOne(id);
    discount.isActive = false;
    await discount.save();
    await this.priceCalcService.recomputeForProduct(String(discount.productId));
    return discount;
  }
}
