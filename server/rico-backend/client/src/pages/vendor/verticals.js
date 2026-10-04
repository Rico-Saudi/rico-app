// What changes between a restaurant's dashboard and a pharmacy's: the words,
// the units, the category suggestions and the extra product fields. Everything
// else is one dashboard. Which vertical a shop is in comes from the server
// (src/vendor/constants/verticals.ts), keyed off its category.
//
// Attribute fields are stored in product.attributes under `key`; keys must be
// plain ASCII identifiers (the server drops anything else).
//   type: 'text' | 'number' | 'select' | 'boolean'
// A select option is a plain string, or { value, label } where the stored
// value has to match the search dictionary (src/search/dictionaries/
// attributes.dict.ts) — that's what makes "بروستد حار" find spiceLevel: spicy.

const SIZE_OPTIONS = [
  { value: 'small', label: 'صغير' },
  { value: 'medium', label: 'وسط' },
  { value: 'large', label: 'كبير' },
];
const COLOR_OPTIONS = [
  { value: 'black', label: 'أسود' },
  { value: 'white', label: 'أبيض' },
  { value: 'red', label: 'أحمر' },
  { value: 'blue', label: 'أزرق' },
  { value: 'green', label: 'أخضر' },
];

const GENERAL = {
  id: 'general',
  label: 'نشاط تجاري',
  itemsLabel: 'المنتجات',
  itemSingular: 'منتج',
  addItem: 'إضافة منتج',
  emptyItems: 'لا توجد منتجات بعد.',
  itemsHint: 'أضف منتجاتك وأسعارها لتظهر للعملاء في ريكو.',
  units: ['حبة', 'علبة', 'كيلو', 'قطعة'],
  categories: [],
  fields: { brand: true, sku: true },
  attributes: [],
};

const PROFILES = {
  food: {
    ...GENERAL,
    id: 'food',
    label: 'مطعم / مقهى',
    itemsLabel: 'القائمة',
    itemSingular: 'صنف',
    addItem: 'إضافة صنف',
    emptyItems: 'القائمة فاضية — أضف أول صنف.',
    itemsHint: 'أصناف قائمتك وأسعارها كما يطلبها العملاء في ريكو.',
    units: ['وجبة', 'طبق', 'حبة', 'كوب', 'علبة', 'كيلو'],
    categories: ['مقبلات', 'أطباق رئيسية', 'سندويشات', 'مشروبات ساخنة', 'مشروبات باردة', 'حلويات', 'وجبات أطفال'],
    fields: { brand: false, sku: false },
    attributes: [
      { key: 'size', label: 'الحجم', type: 'select', options: SIZE_OPTIONS },
      {
        key: 'spiceLevel',
        label: 'الحرارة',
        type: 'select',
        options: [
          { value: 'mild', label: 'عادي' },
          { value: 'spicy', label: 'حار' },
        ],
      },
      { key: 'vegetarian', label: 'نباتي', type: 'boolean' },
      { key: 'calories', label: 'السعرات الحرارية', type: 'number' },
      { key: 'prepMinutes', label: 'وقت التحضير (دقيقة)', type: 'number' },
    ],
  },
  pharmacy: {
    ...GENERAL,
    id: 'pharmacy',
    label: 'صيدلية',
    itemsHint: 'الأدوية والمنتجات المتوفرة عندك. الباركود يسهّل تحديث الأسعار دفعة وحدة.',
    units: ['علبة', 'شريط', 'عبوة', 'زجاجة', 'أنبوب', 'حبة'],
    categories: ['أدوية', 'فيتامينات ومكملات', 'عناية بالبشرة', 'عناية بالطفل', 'مستلزمات طبية', 'عناية شخصية'],
    attributes: [
      { key: 'requiresPrescription', label: 'يحتاج وصفة طبية', type: 'boolean' },
      { key: 'activeIngredient', label: 'المادة الفعالة', type: 'text', placeholder: 'مثال: باراسيتامول' },
      { key: 'strength', label: 'التركيز', type: 'text', placeholder: 'مثال: 500 ملغ' },
      { key: 'dosageForm', label: 'الشكل الدوائي', type: 'select', options: ['أقراص', 'كبسولات', 'شراب', 'كريم', 'قطرة', 'بخاخ', 'حقن', 'لصقة'] },
      { key: 'packSize', label: 'عدد الحبات / الحجم', type: 'text', placeholder: 'مثال: 24 حبة' },
    ],
  },
  grocery: {
    ...GENERAL,
    id: 'grocery',
    label: 'سوبرماركت / بقالة',
    itemsHint: 'منتجات المحل وأسعارها. ارفع ملف الأسعار كاملاً من «استيراد» بدل الإدخال واحداً واحداً.',
    units: ['حبة', 'كيلو', 'غرام', 'لتر', 'علبة', 'كرتون', 'ربطة'],
    categories: ['خضار وفواكه', 'ألبان وأجبان', 'لحوم ودواجن', 'مخبوزات', 'مشروبات', 'معلبات', 'أرز وبقوليات', 'سناكات', 'منظفات', 'عناية شخصية'],
    attributes: [
      { key: 'size', label: 'الحجم / الوزن', type: 'text', placeholder: 'مثال: 1 لتر' },
      { key: 'origin', label: 'بلد المنشأ', type: 'text' },
      { key: 'organic', label: 'عضوي', type: 'boolean' },
    ],
  },
  retail: {
    ...GENERAL,
    id: 'retail',
    label: 'متجر',
    units: ['قطعة', 'حبة', 'طقم', 'زوج', 'علبة'],
    attributes: [
      { key: 'color', label: 'اللون', type: 'select', options: COLOR_OPTIONS },
      { key: 'size', label: 'المقاس', type: 'select', options: SIZE_OPTIONS },
      { key: 'sizes', label: 'كل المقاسات المتوفرة', type: 'text', placeholder: 'مثال: S, M, L, XL' },
      { key: 'model', label: 'الموديل', type: 'text' },
      { key: 'warranty', label: 'الضمان', type: 'text', placeholder: 'مثال: سنتين' },
    ],
  },
  services: {
    ...GENERAL,
    id: 'services',
    label: 'خدمات',
    itemsLabel: 'الخدمات',
    itemSingular: 'خدمة',
    addItem: 'إضافة خدمة',
    emptyItems: 'لا توجد خدمات بعد.',
    itemsHint: 'خدماتك وأسعارها ليحجزها العملاء أو يطلبوها عبر ريكو.',
    units: ['جلسة', 'زيارة', 'ساعة', 'قطعة', 'سيارة'],
    categories: [],
    fields: { brand: false, sku: false },
    attributes: [
      { key: 'durationMinutes', label: 'المدة (دقيقة)', type: 'number' },
      { key: 'requiresBooking', label: 'يحتاج حجز مسبق', type: 'boolean' },
      { key: 'atHome', label: 'متاحة في المنزل', type: 'boolean' },
    ],
  },
  general: GENERAL,
};

export function profileFor(vertical) {
  return PROFILES[vertical] || GENERAL;
}

// Spreadsheet column names a vendor might use, Arabic or English, mapped to
// the field they mean. Matching ignores case and surrounding spaces.
export const IMPORT_COLUMNS = {
  name: ['name', 'product', 'item', 'الاسم', 'اسم المنتج', 'المنتج', 'الصنف', 'اسم الصنف', 'الخدمة'],
  price: ['price', 'السعر', 'سعر'],
  category: ['category', 'الفئة', 'القسم', 'التصنيف'],
  unit: ['unit', 'الوحدة'],
  brand: ['brand', 'الماركة', 'العلامة التجارية', 'الشركة'],
  sku: ['sku', 'barcode', 'code', 'الباركود', 'الكود', 'رمز المنتج'],
  keywords: ['keywords', 'tags', 'كلمات مفتاحية', 'الكلمات المفتاحية', 'وسوم'],
  inStock: ['instock', 'in stock', 'stock', 'available', 'متوفر', 'التوفر', 'الحالة'],
};
