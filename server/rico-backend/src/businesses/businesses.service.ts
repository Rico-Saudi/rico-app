import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Business, BusinessDocument } from './schemas/business.schema';
import { BusinessImage, BusinessImageDocument } from './schemas/business-image.schema';
import {
  ALLOWED_BUSINESS_IMAGE_TYPES,
  MAX_BUSINESS_IMAGE_BYTES,
  businessImageUrl,
} from './constants/business-image.constants';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { ListBusinessDto } from './dto/list-business.dto';

@Injectable()
export class BusinessesService {
  constructor(
    @InjectModel(Business.name) private readonly businessModel: Model<BusinessDocument>,
    @InjectModel(BusinessImage.name) private readonly businessImageModel: Model<BusinessImageDocument>,
  ) {}

  /// Stores a vendor's storefront photo and points the business at it.
  async setImage(id: string, file: Express.Multer.File | undefined): Promise<BusinessDocument> {
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'image_required' });
    if (!ALLOWED_BUSINESS_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({ error: 'unsupported_image_type', allowed: ALLOWED_BUSINESS_IMAGE_TYPES });
    }
    if (file.size > MAX_BUSINESS_IMAGE_BYTES) {
      throw new PayloadTooLargeException({ error: 'image_too_large', maxBytes: MAX_BUSINESS_IMAGE_BYTES });
    }

    const business = await this.findOne(id);
    const image = await this.businessImageModel.create({
      businessId: business._id,
      contentType: file.mimetype,
      size: file.size,
      data: file.buffer,
    });
    // Only after the new image is safely stored, so a failed write leaves the
    // business pointing at the photo it already had.
    await this.businessImageModel.deleteMany({ businessId: business._id, _id: { $ne: image._id } });

    business.imageUrl = businessImageUrl(image._id);
    await business.save();
    return business;
  }

  async clearImage(id: string): Promise<BusinessDocument> {
    const business = await this.findOne(id);
    await this.businessImageModel.deleteMany({ businessId: business._id });
    business.imageUrl = null;
    await business.save();
    return business;
  }

  async findImage(imageId: string): Promise<BusinessImageDocument> {
    const image = await this.businessImageModel.findById(imageId);
    if (!image) throw new NotFoundException({ error: 'image_not_found' });
    return image;
  }

  async create(dto: CreateBusinessDto): Promise<BusinessDocument> {
    return this.businessModel.create({
      name: dto.name,
      nameAr: dto.nameAr ?? null,
      categorySlug: dto.categorySlug,
      placeId: dto.placeId ?? null,
      location: { type: 'Point', coordinates: [dto.lng, dto.lat] },
      city: dto.city ?? null,
      district: dto.district ?? null,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      openingHours: dto.openingHours ?? null,
      priceLevel: dto.priceLevel ?? null,
      rating: dto.rating ?? null,
      ratingCount: dto.ratingCount ?? null,
      enrichmentSource: 'manual',
    });
  }

  async findAll(query: ListBusinessDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { isActive: true };
    if (query.categorySlug) filter.categorySlug = query.categorySlug;

    const [items, total] = await Promise.all([
      this.businessModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.businessModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<BusinessDocument> {
    const business = await this.businessModel.findById(id);
    if (!business) throw new NotFoundException({ error: 'business_not_found' });
    return business;
  }

  async update(id: string, dto: UpdateBusinessDto): Promise<BusinessDocument> {
    const business = await this.findOne(id);
    if (dto.name !== undefined) business.name = dto.name;
    if (dto.nameAr !== undefined) business.nameAr = dto.nameAr;
    if (dto.categorySlug !== undefined) business.categorySlug = dto.categorySlug;
    if (dto.placeId !== undefined) business.placeId = dto.placeId;
    if (dto.lat !== undefined || dto.lng !== undefined) {
      business.location = {
        type: 'Point',
        coordinates: [dto.lng ?? business.location.coordinates[0], dto.lat ?? business.location.coordinates[1]],
      };
    }
    if (dto.city !== undefined) business.city = dto.city;
    if (dto.district !== undefined) business.district = dto.district;
    if (dto.address !== undefined) business.address = dto.address;
    if (dto.phone !== undefined) business.phone = dto.phone;
    if (dto.openingHours !== undefined) business.openingHours = dto.openingHours;
    if (dto.priceLevel !== undefined) business.priceLevel = dto.priceLevel;
    if (dto.rating !== undefined) business.rating = dto.rating;
    if (dto.ratingCount !== undefined) business.ratingCount = dto.ratingCount;
    await business.save();
    return business;
  }

  async remove(id: string): Promise<void> {
    const business = await this.findOne(id);
    business.isActive = false;
    await business.save();
  }

  async setActive(id: string, isActive: boolean): Promise<BusinessDocument> {
    const business = await this.findOne(id);
    business.isActive = isActive;
    await business.save();
    return business;
  }

  // Shared by admin manual-entry and Google-sync flows: find a business
  // already linked to this (source, sourceId) pair and update it in place,
  // or create a new one — keeps re-running either idempotent instead of
  // creating duplicate rows for the same source record.
  async upsertBySource(source: string, sourceId: string, data: Partial<Business>) {
    const existing = await this.businessModel.findOne({
      'sourceLinks.source': source,
      'sourceLinks.sourceId': sourceId,
    });

    if (existing) {
      Object.assign(existing, data);
      await existing.save();
      return { business: existing, created: false };
    }

    const created = await this.businessModel.create({
      ...data,
      sourceLinks: [{ source, sourceId }],
    });
    return { business: created, created: true };
  }
}
