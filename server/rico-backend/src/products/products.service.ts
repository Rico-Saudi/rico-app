import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { ProductImage, ProductImageDocument } from './schemas/product-image.schema';
import { ALLOWED_PRODUCT_IMAGE_TYPES, MAX_PRODUCT_IMAGE_BYTES, productImageUrl } from './constants/product-image.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductDto } from './dto/list-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductImage.name) private readonly productImageModel: Model<ProductImageDocument>,
  ) {}

  async create(dto: CreateProductDto): Promise<ProductDocument> {
    return this.productModel.create({
      businessId: dto.businessId,
      name: dto.name,
      category: dto.category ?? null,
      price: dto.price,
      attributes: dto.attributes ?? {},
      keywords: dto.keywords ?? [],
      finalPrice: dto.price, // no discount yet — PriceCalcService overrides this once one exists
    });
  }

  async findAll(query: ListProductDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { isActive: true };
    if (query.businessId) filter.businessId = query.businessId;

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.productModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException({ error: 'product_not_found' });
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.findOne(id);
    if (dto.name !== undefined) product.name = dto.name;
    if (dto.category !== undefined) product.category = dto.category;
    if (dto.attributes !== undefined) product.attributes = dto.attributes;
    if (dto.keywords !== undefined) product.keywords = dto.keywords;
    if (dto.price !== undefined) {
      product.price = dto.price;
      // Recomputed properly by PriceCalcService if an active discount
      // exists; this keeps finalPrice sane even with no discount at all.
      product.finalPrice = dto.price;
    }
    await product.save();
    return product;
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    product.isActive = false;
    await product.save();
  }

  async setFinalPrice(id: string, finalPrice: number): Promise<void> {
    await this.productModel.updateOne({ _id: id }, { $set: { finalPrice } });
  }

  // Replaces whatever photo the product had: the previous bytes are dropped so
  // a shop that re-shoots a product ten times doesn't leave ten orphans behind.
  async setImage(id: string, file: Express.Multer.File | undefined): Promise<ProductDocument> {
    if (!file?.buffer?.length) throw new BadRequestException({ error: 'image_required' });
    if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({ error: 'unsupported_image_type', allowed: ALLOWED_PRODUCT_IMAGE_TYPES });
    }
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new PayloadTooLargeException({ error: 'image_too_large', maxBytes: MAX_PRODUCT_IMAGE_BYTES });
    }

    const product = await this.findOne(id);
    const image = await this.productImageModel.create({
      productId: product._id,
      contentType: file.mimetype,
      size: file.size,
      data: file.buffer,
    });
    // Only after the new image is safely stored, so a failed write leaves the
    // product pointing at the photo it already had.
    await this.productImageModel.deleteMany({ productId: product._id, _id: { $ne: image._id } });

    product.imageUrl = productImageUrl(image._id);
    await product.save();
    return product;
  }

  async clearImage(id: string): Promise<ProductDocument> {
    const product = await this.findOne(id);
    await this.productImageModel.deleteMany({ productId: product._id });
    product.imageUrl = null;
    await product.save();
    return product;
  }

  async findImage(imageId: string): Promise<ProductImageDocument> {
    // This route is public, so a crawler with a mangled id shouldn't reach the
    // driver and surface as a logged 500 — a malformed id is simply not found.
    if (!isValidObjectId(imageId)) throw new NotFoundException({ error: 'image_not_found' });
    const image = await this.productImageModel.findById(imageId);
    if (!image) throw new NotFoundException({ error: 'image_not_found' });
    return image;
  }
}
