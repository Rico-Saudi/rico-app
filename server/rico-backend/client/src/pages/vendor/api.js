// Session-cookie based — the browser sends the cookie automatically for
// same-origin requests, no Authorization header needed.
export function createAuthedFetch(onUnauthorized) {
  return async function authedFetch(path, options = {}) {
    // A FormData body has to set its own Content-Type — it carries the
    // multipart boundary, and overriding it makes the server read an empty body.
    const isMultipart = options.body instanceof FormData;
    const res = await fetch(path, {
      ...options,
      headers: {
        ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      onUnauthorized();
      return null;
    }
    return res;
  };
}

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

export const DEAL_TYPES = [
  { value: 'percent', label: 'نسبة خصم (٪)' },
  { value: 'fixed', label: 'خصم بمبلغ ثابت (ر.س)' },
  { value: 'bogo', label: 'اشتري واحصل على الثاني مجاناً' },
  { value: 'free_item', label: 'عنصر مجاني' },
  { value: 'bundle', label: 'عرض باقة' },
];

export const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'نسبة خصم (٪)' },
  { value: 'fixed', label: 'سعر ثابت (ر.س)' },
];

export const REQUEST_ITEM_TYPE_LABELS = {
  product: 'منتج',
  deal: 'عرض',
};

export const REQUEST_STATUS_LABELS = {
  new: 'جديد',
  handled: 'تم التعامل معه',
};

// Mirrors REQUEST_STAGES on the server (requests/schemas/request.schema.ts).
export const REQUEST_STAGES = [
  { id: 'new', label: 'جديد', badge: 'bg-amber-100 text-amber-800' },
  { id: 'confirmed', label: 'مؤكد', badge: 'bg-sky-100 text-sky-800' },
  { id: 'ready', label: 'جاهز', badge: 'bg-violet-100 text-violet-800' },
  { id: 'completed', label: 'مكتمل', badge: 'bg-primary/10 text-primary' },
  { id: 'cancelled', label: 'ملغي', badge: 'bg-error/10 text-error' },
];

// Weather a deal can be aimed at. Mirrors WEATHER_BUCKETS on the server;
// 'mild' is deliberately absent — "show this only when the weather is
// unremarkable" is not something anyone wants to say.
export const WEATHER_CONDITIONS = [
  { value: 'hot', label: '🔥 جو حار' },
  { value: 'cold', label: '❄️ جو بارد' },
  { value: 'rain', label: '🌧️ مطر' },
  { value: 'sandstorm', label: '🌫️ غبار' },
  { value: 'pleasant', label: '🌤️ جو معتدل' },
];
