import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, User, Tag, Package, Search, MessageCircle, Store } from 'lucide-react';
import { REQUEST_ITEM_TYPE_LABELS, REQUEST_STAGES } from './api';

const STAGE_BY_ID = Object.fromEntries(REQUEST_STAGES.map((s) => [s.id, s]));

// The next step offered on each card, and what the button says. Cancelling is
// offered separately on every open order, with a reason for the customer.
const NEXT_ACTION = {
  new: { stage: 'confirmed', label: 'تأكيد الطلب' },
  confirmed: { stage: 'ready', label: 'جاهز' },
  ready: { stage: 'completed', label: 'تم التسليم' },
};

const FILTERS = [
  { id: 'open', label: 'مفتوحة', match: (s) => s === 'new' || s === 'confirmed' || s === 'ready' },
  ...REQUEST_STAGES.map((s) => ({ id: s.id, label: s.label, match: (stage) => stage === s.id })),
  { id: 'all', label: 'الكل', match: () => true },
];

function StageBadge({ stage }) {
  const s = STAGE_BY_ID[stage] || STAGE_BY_ID.new;
  return <span className={`shrink-0 text-xs font-bold px-3 py-1 rounded-full ${s.badge}`}>{s.label}</span>;
}

// wa.me wants the number in international form without "+" or leading zeros;
// a local Saudi mobile (05xxxxxxxx) becomes 9665xxxxxxxx.
function whatsappLink(phone, text) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('05') && digits.length === 10) digits = `966${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function RequestsTab({ authedFetch, activeClaims = [] }) {
  const [requests, setRequests] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [cancelling, setCancelling] = useState(null); // { id, note }
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await authedFetch('/vendor/requests');
    if (!res) return;
    const data = await res.json();
    setRequests(data.requests || []);
  }, [authedFetch]);

  useEffect(() => {
    load();
    // New orders arrive from the chat while the tab sits open; a minute is
    // soon enough for a shop and cheap enough for the server.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function setStage(id, stage, note) {
    setBusyId(id);
    setError('');
    const res = await authedFetch(`/vendor/requests/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(note ? { stage, note } : { stage }),
    });
    setBusyId(null);
    if (!res) return;
    if (!res.ok) {
      setError('ما قدرنا نحدّث الطلب — يمكن تغيّرت حالته. حدّثنا القائمة.');
      load();
      return;
    }
    const updated = await res.json();
    setRequests((list) => list.map((r) => (r.id === id ? { ...r, stage: updated.stage, status: updated.status, vendorNote: updated.vendorNote } : r)));
    setCancelling(null);
  }

  const counts = useMemo(() => {
    const c = {};
    for (const f of FILTERS) c[f.id] = (requests || []).filter((r) => f.match(r.stage)).length;
    return c;
  }, [requests]);

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    const q = query.trim().toLowerCase();
    return (requests || []).filter(
      (r) =>
        f.match(r.stage) &&
        (!q ||
          r.customerName?.toLowerCase().includes(q) ||
          r.customerPhone?.includes(q) ||
          String(r.id).toLowerCase().endsWith(q) ||
          r.items.some((i) => i.label?.toLowerCase().includes(q))),
    );
  }, [requests, filter, query]);

  const showBusiness = activeClaims.length > 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">الطلبات</h1>
        <p className="text-on-surface-variant mt-1">
          طلبات وصلتك من عملاء ريكو. حدّث حالة كل طلب ليعرف العميل وين وصل.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 bg-surface-container rounded-xl p-1 text-xs font-bold">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === f.id ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'bg-transparent text-on-surface-variant'
              }`}
            >
              {f.label}
              {counts[f.id] > 0 && <span className="ms-1 opacity-70">{counts[f.id]}</span>}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-on-surface-variant" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العميل أو رقمه أو رقم الطلب"
            className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl ps-9 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-error bg-error/5 rounded-xl px-4 py-3">{error}</p>}

      <div className="space-y-3">
        {requests === null && <p className="text-sm text-on-surface-variant">جاري التحميل...</p>}
        {requests && visible.length === 0 && (
          <div className="bg-surface-container-lowest rounded-3xl text-center py-10">
            <Package className="w-8 h-8 mx-auto text-on-surface-variant/40 mb-2" />
            <p className="text-on-surface-variant">{requests.length === 0 ? 'لا توجد طلبات بعد.' : 'لا توجد طلبات هنا.'}</p>
          </div>
        )}
        {visible.map((r) => {
          const next = NEXT_ACTION[r.stage];
          const open = !!next;
          const reference = String(r.id).slice(-6).toUpperCase();
          return (
            <div
              key={r.id}
              className={`bg-surface-container-lowest rounded-3xl p-5 shadow-sm space-y-3 ${open ? '' : 'opacity-70'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <span className="font-mono font-bold">#{reference}</span>
                    <span>{new Date(r.createdAt).toLocaleString('ar-SA')}</span>
                    {showBusiness && r.businessName && (
                      <span className="flex items-center gap-1">
                        <Store className="w-3.5 h-3.5" /> {r.businessName}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="flex items-center gap-1 font-bold">
                      <User className="w-4 h-4" /> {r.customerName}
                    </span>
                    <a href={`tel:${r.customerPhone}`} className="flex items-center gap-1 text-primary font-semibold" dir="ltr">
                      <Phone className="w-3.5 h-3.5" /> {r.customerPhone}
                    </a>
                    <a
                      href={whatsappLink(r.customerPhone, `مرحباً ${r.customerName}، بخصوص طلبك #${reference} عبر ريكو`)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary font-semibold"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> واتساب
                    </a>
                  </div>
                </div>
                <StageBadge stage={r.stage} />
              </div>

              {/* A request is a basket, so every line is listed with its
                  count — the shop needs to prepare the whole order. */}
              <div className="bg-surface-container rounded-2xl px-4 py-3 space-y-1.5">
                {r.items.map((item, i) => (
                  <div key={`${item.itemId}-${i}`} className="flex items-center gap-2">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover bg-surface-container-high shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                        {item.itemType === 'product' ? (
                          <Package className="w-4 h-4 text-primary" />
                        ) : (
                          <Tag className="w-4 h-4" style={{ color: '#C9A24A' }} />
                        )}
                      </div>
                    )}
                    {item.quantity > 1 && (
                      <span className="text-xs font-extrabold text-primary bg-primary/10 rounded-md px-1.5 py-0.5 shrink-0">
                        ×{item.quantity}
                      </span>
                    )}
                    <span className="text-sm font-bold truncate">{item.label}</span>
                    <span className="text-xs text-on-surface-variant shrink-0">
                      ({REQUEST_ITEM_TYPE_LABELS[item.itemType] || item.itemType}
                      {item.detail ? ` · ${item.detail}` : ''})
                    </span>
                  </div>
                ))}
                {r.total > 0 && <div className="text-sm font-extrabold text-primary pt-1">الإجمالي: {r.total} ر.س</div>}
              </div>

              {r.vendorNote && (
                <p className="text-xs text-on-surface-variant">
                  ملاحظتك للعميل: <span className="font-semibold text-on-surface">{r.vendorNote}</span>
                </p>
              )}

              {open && cancelling?.id !== r.id && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStage(r.id, next.stage)}
                    disabled={busyId === r.id}
                    className="text-sm font-bold px-4 py-2 rounded-xl bg-primary text-on-primary disabled:opacity-60"
                  >
                    {next.label}
                  </button>
                  {r.stage !== 'ready' && (
                    <button
                      onClick={() => setStage(r.id, 'completed')}
                      disabled={busyId === r.id}
                      className="text-sm font-semibold px-4 py-2 rounded-xl bg-surface-container text-on-surface disabled:opacity-60"
                    >
                      تم التسليم مباشرة
                    </button>
                  )}
                  <button
                    onClick={() => setCancelling({ id: r.id, note: '' })}
                    disabled={busyId === r.id}
                    className="text-sm font-semibold px-4 py-2 rounded-xl bg-transparent text-error hover:bg-error/5 disabled:opacity-60"
                  >
                    إلغاء الطلب
                  </button>
                </div>
              )}

              {cancelling?.id === r.id && (
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    autoFocus
                    value={cancelling.note}
                    maxLength={300}
                    onChange={(e) => setCancelling({ ...cancelling, note: e.target.value })}
                    placeholder="سبب الإلغاء للعميل (مثال: الصنف نفد)"
                    className="flex-1 min-w-[200px] bg-surface-container border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-error/20"
                  />
                  <button
                    onClick={() => setStage(r.id, 'cancelled', cancelling.note.trim())}
                    disabled={busyId === r.id}
                    className="text-sm font-bold px-4 py-2 rounded-xl bg-error text-white disabled:opacity-60"
                  >
                    تأكيد الإلغاء
                  </button>
                  <button
                    onClick={() => setCancelling(null)}
                    className="text-sm font-semibold px-3 py-2 rounded-xl bg-transparent text-on-surface-variant"
                  >
                    تراجع
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
