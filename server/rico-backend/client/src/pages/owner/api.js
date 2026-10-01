// Session-cookie based — the browser sends the cookie automatically for
// same-origin requests, no Authorization header needed.
export function createAuthedFetch(onUnauthorized) {
  return async function authedFetch(path, options = {}) {
    const res = await fetch(path, options);
    if (res.status === 401) {
      onUnauthorized();
      return null;
    }
    return res;
  };
}

// يقرأ رسالة الخطأ الحقيقية من رد الخادم بدل عرض نص عام. الخادم يرد الآن
// بـ{error, fields?, requestId} من AllExceptionsFilter، وrequestId يطابق سطر
// السجل — فيصير بلاغ المستخدم قابلاً للتتبّع بدل "تعذر ..." بلا معلومة.
const ERROR_LABELS = {
  validation_failed: 'بيانات غير صحيحة',
  invalid_value: 'قيمة غير صحيحة',
  invalid_coordinates: 'الإحداثيات خارج المدى المسموح',
  already_exists: 'السجل موجود مسبقاً',
  unauthorized: 'انتهت الجلسة، سجّل الدخول من جديد',
};

export async function errorMessage(res, fallback) {
  if (!res) return fallback;
  let body = null;
  try {
    body = await res.json();
  } catch {
    return fallback;
  }
  if (!body || typeof body !== 'object') return fallback;

  const label = ERROR_LABELS[body.error] || body.message || body.error || fallback;
  const fields = body.fields && typeof body.fields === 'object' ? Object.keys(body.fields) : [];
  const detail = fields.length ? ` (${fields.join('، ')})` : '';
  const ref = body.requestId ? ` — مرجع: ${String(body.requestId).slice(0, 8)}` : '';
  return `${label}${detail}${ref}`;
}

// Kept in sync with CATEGORIES in src/classify/constants/categories.ts —
// this map is what fills the sourcing and directory dropdowns, so a
// category missing here is a category no admin can source from Google.
export const CATEGORY_LABELS = {
  restaurant: 'مطاعم',
  cafe: 'كافيهات',
  pharmacy: 'صيدليات',
  supermarket: 'سوبرماركت',
  fuel: 'محطات وقود',
  mall: 'مولات',
  atm: 'صرافات آلية',
  bank: 'بنوك',
  hospital: 'مستشفيات',
  clinic: 'عيادات',
  fitness_centre: 'نوادي رياضية',
  hotel: 'فنادق',
  clothes: 'محلات ملابس',
  mobile_phone: 'محلات جوالات',
  electronics: 'محلات إلكترونيات',
  hairdresser: 'صالونات حلاقة',
  beauty: 'صالونات تجميل',
  car_wash: 'مغاسل سيارات',
  dentist: 'عيادات أسنان',
  mosque: 'مساجد',
  park: 'حدائق',
  bakery: 'مخابز',
  sweets: 'محلات حلويات',
  bookstore: 'مكتبات وقرطاسية',
  toy_store: 'محلات ألعاب أطفال',
  pet_store: 'محلات حيوانات أليفة',
  jewelry_store: 'محلات مجوهرات',
  furniture_store: 'محلات أثاث',
  shoe_store: 'محلات أحذية',
  gift_shop: 'محلات هدايا',
  florist: 'محلات ورد',
  laundry: 'مغاسل ملابس',
  veterinary: 'عيادات بيطرية',
  car_repair: 'كراجات تصليح سيارات',
  car_dealer: 'معارض سيارات',
  car_rental: 'تأجير سيارات',
  parking: 'مواقف سيارات',
  lawyer: 'مكاتب محاماة',
  real_estate: 'مكاتب عقارات',
  travel_agency: 'مكاتب سفريات',
  insurance: 'شركات تأمين',
  school: 'مدارس',
  university: 'جامعات',
  kindergarten: 'حضانات ورياض أطفال',
  library: 'مكتبات عامة',
  phone_repair: 'صيانة جوالات',
  appliance_repair: 'صيانة أجهزة منزلية',
  maintenance_centre: 'مراكز صيانة',
  oil_change: 'محلات تغيير زيت',
  money_exchange: 'صرافة وتحويل عملات',
  tailor: 'خياطون وتفصيل',
  butcher: 'ملاحم',
  cosmetics: 'عطور ومستحضرات تجميل',
  hardware_store: 'خردوات ومواد بناء',
  auto_parts: 'قطع غيار',
  sporting_goods: 'محلات أدوات رياضية',
  optician: 'محلات نظارات',
  cinema: 'سينمات',
  amusement: 'مدن ألعاب وملاهي',
  post_office: 'مكاتب بريد',
  police: 'مراكز شرطة',
  government_office: 'دوائر حكومية',
};

export const CLAIM_STATUS_LABELS = {
  active: 'مُفعّل',
  pending_review: 'قيد المراجعة',
  rejected: 'مرفوض',
  suspended: 'معلّق',
};

export const DEAL_STATUS_LABELS = {
  active: 'مُفعّل',
  pending_review: 'قيد المراجعة',
  rejected: 'مرفوض',
  expired: 'منتهي',
};

export const DEAL_TYPE_LABELS = {
  percent: 'نسبة خصم',
  fixed: 'خصم بمبلغ ثابت',
  bogo: 'اشتري واحصل على الثاني',
  free_item: 'عنصر مجاني',
  bundle: 'عرض باقة',
};

export const DEAL_TYPES = Object.entries(DEAL_TYPE_LABELS).map(([value, label]) => ({ value, label }));
