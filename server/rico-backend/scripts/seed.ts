import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { BusinessesService } from '../src/businesses/businesses.service';
import { ProductsService } from '../src/products/products.service';
import { DiscountsService } from '../src/discounts/discounts.service';
import { DealsService } from '../src/deals/deals.service';

// Riyadh-area coordinates, spread out enough to exercise radius/geo search.
const RESTAURANTS = [
  {
    name: 'Al Baik Restaurant',
    nameAr: 'مطعم البيك',
    lat: 24.7136,
    lng: 46.6753,
    priceLevel: 1,
    rating: 4.5,
    ratingCount: 900,
    products: [
      { name: 'Chicken Shawarma', nameAr: 'شاورما دجاج', price: 12, keywords: ['shawarma', 'شاورما', 'دجاج', 'chicken'], attributes: { spiceLevel: 'mild' } },
      { name: 'Spicy Broasted', nameAr: 'بروستد حار', price: 18, keywords: ['broasted', 'بروستد', 'حار', 'spicy'], attributes: { spiceLevel: 'spicy' } },
    ],
  },
  {
    name: 'Najd Village',
    nameAr: 'قرية نجد',
    lat: 24.7255,
    lng: 46.6199,
    priceLevel: 3,
    rating: 4.7,
    ratingCount: 620,
    products: [
      { name: 'Grilled Mandi', nameAr: 'مندي مشوي', price: 45, keywords: ['mandi', 'مندي', 'مشوي', 'grilled'], attributes: {} },
    ],
  },
  {
    name: 'Cheap Eats Corner',
    nameAr: 'ركن الأكل الرخيص',
    lat: 24.7011,
    lng: 46.685,
    priceLevel: 1,
    rating: 3.9,
    ratingCount: 210,
    products: [
      { name: 'Basic Shawarma', nameAr: 'شاورما اقتصادية', price: 7, keywords: ['shawarma', 'شاورما', 'رخيص', 'اقتصادي'], attributes: { spiceLevel: 'mild' } },
    ],
  },
  {
    name: 'Coffee Loft',
    nameAr: 'كوفي لوفت',
    categorySlug: 'cafe',
    lat: 24.72,
    lng: 46.63,
    priceLevel: 2,
    rating: 4.3,
    ratingCount: 340,
    products: [
      { name: 'Iced Latte', nameAr: 'لاتيه مثلج', price: 22, keywords: ['latte', 'لاتيه', 'قهوة', 'coffee'], attributes: {} },
    ],
  },
  {
    name: 'Threads Boutique',
    nameAr: 'بوتيك ثريدز',
    categorySlug: 'mall',
    lat: 24.708,
    lng: 46.66,
    priceLevel: 2,
    rating: 4.1,
    ratingCount: 88,
    products: [
      { name: 'Black T-Shirt', nameAr: 'تيشيرت أسود', price: 35, keywords: ['tshirt', 'تيشيرت', 'اسود', 'black'], attributes: { color: 'black', size: 'medium' } },
      { name: 'Cheap Black Tee', nameAr: 'تيشيرت أسود رخيص', price: 15, keywords: ['tshirt', 'تيشيرت', 'اسود', 'رخيص', 'black'], attributes: { color: 'black', size: 'large' } },
    ],
  },
  {
    name: 'Riyadh Grill House',
    nameAr: 'بيت الشواء الرياض',
    lat: 24.68,
    lng: 46.71,
    priceLevel: 3,
    rating: 4.4,
    ratingCount: 505,
    products: [
      { name: 'Mixed Grill', nameAr: 'مشاوي مشكلة', price: 55, keywords: ['grill', 'مشاوي', 'مشكلة'], attributes: {} },
    ],
  },
];

async function run() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('Refusing to seed production without --force');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const businessesService = app.get(BusinessesService);
  const productsService = app.get(ProductsService);
  const discountsService = app.get(DiscountsService);
  const dealsService = app.get(DealsService);

  const createdBusinessIds: string[] = [];
  const createdProductIds: string[] = [];

  for (const r of RESTAURANTS) {
    const business = await businessesService.create({
      name: r.name,
      nameAr: r.nameAr,
      categorySlug: (r as any).categorySlug ?? 'restaurant',
      lat: r.lat,
      lng: r.lng,
      city: 'Riyadh',
      priceLevel: r.priceLevel,
      rating: r.rating,
      ratingCount: r.ratingCount,
    } as any);
    createdBusinessIds.push(String(business._id));
    console.log(`business: ${r.name} (${business._id})`);

    for (const p of r.products) {
      const product = await productsService.create({
        businessId: String(business._id),
        name: p.name,
        category: 'food',
        price: p.price,
        keywords: [...p.keywords, p.nameAr, p.name],
        attributes: p.attributes,
      } as any);
      createdProductIds.push(String(product._id));
      console.log(`  product: ${p.name} (${product._id}) — ${p.price} SAR`);
    }
  }

  // A couple of active discounts on the first two products.
  if (createdProductIds[0]) {
    await discountsService.create({ productId: createdProductIds[0], type: 'percentage', value: 20 });
    console.log(`discount: 20% off product ${createdProductIds[0]}`);
  }
  if (createdProductIds[2]) {
    await discountsService.create({ productId: createdProductIds[2], type: 'fixed', value: 5 });
    console.log(`discount: fixed 5 SAR product ${createdProductIds[2]}`);
  }

  // A couple of place-level deals.
  if (createdBusinessIds[0]) {
    await dealsService.createManual({
      businessId: createdBusinessIds[0],
      titleAr: 'خصم 15% على كل الوجبات',
      dealType: 'percent',
      value: 15,
      source: 'manual',
      status: 'active',
    } as any);
    console.log(`deal: 15% off at business ${createdBusinessIds[0]}`);
  }
  if (createdBusinessIds[3]) {
    await dealsService.createManual({
      businessId: createdBusinessIds[3],
      titleAr: 'اشتري قهوة واحصل على الثانية مجاناً',
      dealType: 'bogo',
      source: 'manual',
      status: 'active',
    } as any);
    console.log(`deal: BOGO at business ${createdBusinessIds[3]}`);
  }

  await app.close();
  console.log('Seed complete.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
