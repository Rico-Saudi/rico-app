import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { ProductImage, ProductImageDocument } from './schemas/product-image.schema';
import { ALLOWED_PRODUCT_IMAGE_TYPES, MAX_PRODUCT_IMAGE_BYTES, productImageUrl } from './constants/product-image.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductDto } from './dto/list-product.dto';

// Optional text fields arrive as undefined (leave alone), null or '' (clear),
// or a value. Blank is stored as null so "no brand" has a single spelling.
function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface BulkProductRow {
  name: string;
  price: number;
  category?: string | null;
  unit?: string | null;
  brand?: string | null;
  sku?: string | null;
  keywords?: string[];
  inStock?: boolean;
}

export interface BulkUpsertResult {
  created: number;
  updated: number;
  // Products whose price changed, so the caller can re-apply their discounts.
  repricedIds: string[];
}

// Name matching ignores case and runs of spaces, nothing more: "Panadol 500"
// and "panadol  500" are one product, "بنادول" and "Panadol" are two.
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface VendorProductQuery {
  businessId: string;
  q?: string;
  category?: string;
  stock?: 'in' | 'out';
  page?: number;
  limit?: number;
}

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
      category: optionalText(dto.category) ?? null,
      price: dto.price,
      unit: optionalText(dto.unit) ?? null,
      brand: optionalText(dto.brand) ?? null,
      sku: optionalText(dto.sku) ?? null,
      inStock: dto.inStock ?? true,
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

  // The vendor's own catalogue view: unlike findAll it can search and filter,
  // because a supermarket or pharmacy lists thousands of rows where a
  // restaurant lists thirty. Also returns the shop's category names so the
  // dashboard can offer them as filters without a second request.
  async findForVendor(query: VendorProductQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 100));
    const base: Record<string, unknown> = { businessId: query.businessId, isActive: true };
    const filter: Record<string, unknown> = { ...base };
    if (query.category) filter.category = query.category;
    if (query.stock === 'in') filter.inStock = { $ne: false };
    if (query.stock === 'out') filter.inStock = false;
    const q = query.q?.trim();
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: pattern }, { sku: pattern }, { brand: pattern }, { keywords: pattern }];
    }

    const [items, total, categories, outOfStock] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.productModel.countDocuments(filter),
      this.productModel.distinct('category', { ...base, category: { $ne: null } }),
      this.productModel.countDocuments({ ...base, inStock: false }),
    ]);

    return { items, total, page, limit, categories: (categories as string[]).sort(), outOfStock };
  }

  // A whole price list in one go. Each row updates the product it matches —
  // by sku when it has one, by name otherwise — or adds a new one; rows are
  // already validated by the caller. Later rows win over earlier ones, so a
  // file listing the same item twice ends up with its last line.
  async bulkUpsert(businessId: string, rows: BulkProductRow[]): Promise<BulkUpsertResult> {
    const existing = await this.productModel.find({ businessId, isActive: true }, '_id name sku price').lean();
    const bySku = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const p of existing) {
      if (p.sku) bySku.set(p.sku, p);
      byName.set(nameKey(p.name), p);
    }

    const updates = new Map<string, { set: Record<string, any>; priceChanged: boolean }>();
    const creates = new Map<string, Record<string, unknown>>(); // keyed like the lookups, so repeats merge

    for (const row of rows) {
      const fields: Record<string, unknown> = { name: row.name.trim(), price: row.price };
      for (const key of ['category', 'unit', 'brand', 'sku'] as const) {
        const value = optionalText(row[key]);
        if (value !== undefined) fields[key] = value;
      }
      if (row.keywords !== undefined) fields.keywords = row.keywords;
      if (row.inStock !== undefined) fields.inStock = row.inStock;

      const sku = optionalText(row.sku);
      const match = (sku && bySku.get(sku)) || byName.get(nameKey(row.name));
      if (match) {
        const id = String(match._id);
        const prior = updates.get(id);
        updates.set(id, {
          set: { ...(prior?.set ?? {}), ...fields },
          priceChanged: (prior?.priceChanged ?? false) || match.price !== row.price,
        });
        continue;
      }

      const key = sku ? `sku:${sku}` : `name:${nameKey(row.name)}`;
      creates.set(key, { ...(creates.get(key) ?? {}), ...fields });
    }

    if (updates.size > 0) {
      await this.productModel.bulkWrite(
        [...updates.entries()].map(([id, u]) => ({
          updateOne: {
            filter: { _id: id },
            // An unchanged price leaves finalPrice alone, discount and all. A
            // changed one resets it, and the caller re-applies any discount
            // through repricedIds — same as a single update.
            update: { $set: { ...u.set, ...(u.priceChanged ? { finalPrice: u.set.price } : {}) } },
          },
        })),
      );
    }
    if (creates.size > 0) {
      await this.productModel.insertMany(
        [...creates.values()].map((fields) => ({
          businessId,
          category: null,
          unit: null,
          brand: null,
          sku: null,
          keywords: [],
          inStock: true,
          attributes: {},
          ...fields,
          finalPrice: fields.price,
        })),
      );
    }

    return {
      created: creates.size,
      updated: updates.size,
      repricedIds: [...updates.entries()].filter(([, u]) => u.priceChanged).map(([id]) => id),
    };
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException({ error: 'product_not_found' });
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.findOne(id);
    if (dto.name !== undefined) product.name = dto.name;
    if (dto.category !== undefined) product.category = optionalText(dto.category) ?? null;
    if (dto.unit !== undefined) product.unit = optionalText(dto.unit) ?? null;
    if (dto.brand !== undefined) product.brand = optionalText(dto.brand) ?? null;
    if (dto.sku !== undefined) product.sku = optionalText(dto.sku) ?? null;
    if (dto.inStock !== undefined) product.inStock = dto.inStock;
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
