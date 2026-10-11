// Edits to a basket the conversation already holds: "شيل البيبسي", "بدل
// الشاورما خليها فلافل", "خلي الكل اتنين", "لا خلها من هرفي", "زيد ٢ فلافل".
//
// The app opens a fresh basket for every order intent it receives — it does
// not merge with the last one. So an edit answers with the whole basket as it
// should now be, never with only what changed.

import { Intent, OrderItem, validateIntent } from '../intent-validation';
import { normalizeArabic } from '../../learning/constants/normalize';
import { correctedShop, OrderDeps, parseBasket } from './order-parser';

const fold = (s: string) => normalizeArabic(s).replace(/(\p{L})\1{2,}/gu, '$1');
const words = (s: string) =>
  fold(s)
    .split(' ')
    .map((w) => w.replace(/^(?:وال|بال|ال|و)/u, ''))
    .filter(Boolean);

/** Whether a phrase names an item in the basket ("البيبسي" → "بيبسي"). */
function names(item: OrderItem, phrase: string): boolean {
  const a = words(item.name);
  const b = words(phrase).filter((w) => !STOPWORDS.has(w));
  return b.length > 0 && b.every((w) => a.some((x) => x === w || x.startsWith(w) || w.startsWith(x)));
}
const STOPWORDS = new Set(['كل', 'شي', 'منهم', 'منها', 'بس', 'كمان', 'لي', 'يعني', 'اه', 'لا', 'خلص', 'زياده', 'الباقي', 'زي', 'ما', 'هو']);

const NUMBER: Record<string, number> = Object.fromEntries(
  Object.entries({ واحد: 1, وحده: 1, اثنين: 2, اتنين: 2, ثنتين: 2, تنين: 2, ثلاث: 3, ثلاثه: 3, تلات: 3, تلاته: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, سته: 6, ست: 6, عشر: 10, عشره: 10, درزن: 12 }).map(([k, v]) => [fold(k), v]),
);
function numberIn(s: string): number | null {
  const digits = /(\d+)/u.exec(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) & 0xf)));
  if (digits) return Number(digits[1]);
  for (const w of fold(s).split(' ')) if (NUMBER[w]) return NUMBER[w];
  return null;
}

const REMOVE = /(?:^|\s)(?:شيل|شيلي|الغ|الغي|بلاش|ولا بلاش|بدون|لا تحط|احذف|امسح)\s+(.+?)(?=\s+و(?:حط|خل|خلي|زيد)|$)/u;
const KEEP_ONLY = /(?:خل|خلي|خليها|خليه)\s+(?:بس\s+)?(.+?)\s+بس(?:\s|$)|(?:وخل|وخلي)\s+بس\s+(.+)$/u;
const SWAP = /(?:^|\s)بدل\s+(?:ال)?(.+?)\s+(?:خليها|خليه|خلها|خله|حط|حطلي)?\s*(.+)$/u;
const SWAP_PUT = /(?:شيل|الغ)\s+(.+?)\s+و(?:حط|خلي)\s+(?:بداله|بدالها|مكانه)?\s*(.+)$/u;
const RESIZE = /^(?:ال)?(\S+)\s+(?:خلها|خليها|خليه|خله)\s+(\S+)\s+(?:بدل|بدال)\s+(?:ال)?(\S+)/u;
const ALL_QTY = /(?:خلي|خل|خلو)\s+(?:الكل|كل شي|كل اشي|كلهم)\s+(\S+)/u;
const ITEM_QTY = /(?:خلي|خل)\s+(?:ال)?(\S+(?:\s\S+)?)\s+(\d+|\S+)(?:\s+بدال|\s+بدل|$)|^(?:ال)?(\S+)\s+(?:خليها|خلها|خليه|خله)\s+(.+?)(?:\s+بس)?$/u;
const PLUS_ONE = /(?:زيدها|زيده|زيدهم)\s+(?:وحده|واحد)|زيد واحد كمان/u;
const ADD = /^(?:و|وبعد|زيد|زيدلي|وزيد|زود|ضيف|ضيفلي|وضيف|كمان|وكمان|بعد|and)(?:\s+(?:عليها|عليه|عليهم))?\s+/u;

/**
 * يعدّل السلة اللي بالمحادثة حسب الرسالة، أو null إذا الرسالة مش تعديل.
 * الناتج دايماً السلة كاملة بعد التعديل.
 */
export function editBasket(prev: Intent, message: string, deps: OrderDeps): Intent | null {
  const text = fold(message).replace(/^(?:لا|لا لا|طيب|ايه|اه|اي|بالله|يعني)\s+/u, '');
  const items: OrderItem[] = (prev.orderItems ?? []).map((i) => ({ ...i }));
  const done = (basket: OrderItem[], shop?: { placeName: string | null; position: number | null; category: string | null } | null) =>
    validateIntent({
      kind: 'order',
      placeName: shop ? shop.placeName : prev.placeName,
      referencedPosition: shop ? shop.position : prev.referencedPosition,
      category: shop ? shop.category : prev.category,
      orderItems: basket,
    });

  // A different shop, same basket: "لا خلها من هرفي بدل البيك".
  if (/(?:^|\s)من\s/u.test(text) && /(?:بدل|بدال|مش من|مو من|خلها من|خليها من|خليه من)/u.test(text)) {
    const shop = correctedShop(message, deps);
    if (shop) return done(items, shop);
  }

  // Everything to one count: "خلي الكل اتنين".
  const all = ALL_QTY.exec(text);
  if (all) {
    const n = numberIn(all[1]);
    if (n) return done(items.map((i) => ({ ...i, quantity: n })));
  }

  // "شيل كل شي وخل بس الشاورما", "خل البرجر بس".
  const keep = KEEP_ONLY.exec(text);
  if (keep && /(?:شيل|الغ|بس)/u.test(text)) {
    const phrase = keep[1] ?? keep[2];
    const kept = items.filter((i) => names(i, phrase));
    if (kept.length) return done(kept);
  }

  // "شيل الفيتامين وحط بداله زنك", "بدل البيبسي سفن اب".
  const swap = SWAP_PUT.exec(text) ?? SWAP.exec(text);
  if (swap) {
    const [from, to] = [swap[1], swap[2].replace(/(?:،|,)?\s*والباقي.*$/u, '').trim()];
    const k = items.findIndex((i) => names(i, from));
    if (k >= 0 && to) {
      items[k] = { name: to.replace(/^(?:ال)/u, ''), quantity: items[k].quantity };
      return done(items);
    }
  }

  // "البيتزا خلها كبيرة بدل الوسط": a size swapped inside the name.
  const resize = RESIZE.exec(text);
  if (resize) {
    const k = items.findIndex((i) => names(i, resize[1]));
    if (k >= 0) {
      const old = fold(resize[3]);
      const parts = items[k].name.split(' ');
      const at = parts.findIndex((w) => fold(w).replace(/^ال/u, '') === old);
      if (at >= 0) parts[at] = resize[2];
      else parts.push(resize[2]);
      items[k] = { ...items[k], name: parts.join(' ') };
      return done(items);
    }
  }

  // "شيل البيبسي", "ولا بلاش الحمص", "الغ البطاطس والكولا".
  const remove = REMOVE.exec(text);
  if (remove) {
    const phrases = remove[1].split(/\s+و(?=\S)|\s+و\s+/u);
    const left = items.filter((i) => !phrases.some((p) => names(i, p)));
    if (left.length < items.length) return done(left.length ? left : items);
  }

  // "زيدها وحدة كمان": one more of the last item.
  if (PLUS_ONE.test(text) && items.length) {
    items[items.length - 1].quantity += 1;
    return done(items);
  }

  // "خلي الشاورما خمسة والبطاطا وحدة", "البندورة خليها كيلو واحد بس".
  const changes = text.split(/\s+و(?=\S)/u);
  let changed = false;
  for (const part of changes) {
    const m = ITEM_QTY.exec(part);
    if (!m) continue;
    const phrase = m[1] ?? m[3];
    const n = numberIn(m[2] ?? m[4] ?? '');
    const k = items.findIndex((i) => names(i, phrase));
    if (k >= 0 && n) {
      items[k].quantity = n;
      changed = true;
    }
  }
  if (changed) return done(items);

  // Additions: "زيد عليها ٣ ببسي", "ضيفلي عليهم كنافتين", "وزيد ٢ فلافل".
  if (ADD.test(text)) {
    const added = parseBasket(message.replace(/^\s*(?:و?(?:زيد|زيدلي|زود|ضيف|ضيفلي|كمان|بعد)|و)(?:\s+(?:عليها|عليه|عليهم))?\s*/u, ''), deps);
    if (added.length) return done([...items, ...added]);
  }
  return null;
}
