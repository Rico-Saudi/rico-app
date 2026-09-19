import { useCallback, useEffect, useState } from 'react';
import { Phone, User, Tag, Package } from 'lucide-react';
import { REQUEST_ITEM_TYPE_LABELS } from './api';

export default function RequestsTab({ authedFetch }) {
  const [requests, setRequests] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const res = await authedFetch('/vendor/requests');
    if (!res) return;
    const data = await res.json();
    setRequests(data.requests || []);
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function markHandled(id) {
    setBusyId(id);
    const res = await authedFetch(`/vendor/requests/${id}/handled`, { method: 'PATCH' });
    setBusyId(null);
    if (res && res.ok) load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">الطلبات</h1>
        <p className="text-on-surface-variant mt-1">عملاء أبدوا اهتماماً بمنتج أو عرض عبر الدردشة — تواصل معهم مباشرة.</p>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm space-y-3">
        {requests === null && <p className="text-sm text-on-surface-variant">جاري التحميل...</p>}
        {requests && requests.length === 0 && (
          <div className="text-center py-8">
            <Package className="w-8 h-8 mx-auto text-on-surface-variant/40 mb-2" />
            <p className="text-on-surface-variant">لا توجد طلبات بعد.</p>
          </div>
        )}
        {requests?.map((r) => (
          <div
            key={r.id}
            className={`flex items-start justify-between gap-4 bg-surface-container rounded-2xl px-4 py-3 ${
              r.status === 'handled' ? 'opacity-60' : ''
            }`}
          >
            <div className="space-y-2 min-w-0">
              {/* A request is a basket now, so every line is listed with its
                  count — the vendor needs to pick the whole order, not one item. */}
              <div className="space-y-1.5">
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
              </div>
              {r.total > 0 && (
                <div className="text-sm font-extrabold text-primary">الإجمالي: {r.total} ر.س</div>
              )}
              <div className="flex items-center gap-3 text-xs text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> {r.customerName}
                </span>
                <a href={`tel:${r.customerPhone}`} className="flex items-center gap-1 text-primary font-semibold">
                  <Phone className="w-3.5 h-3.5" /> {r.customerPhone}
                </a>
                <span>{new Date(r.createdAt).toLocaleString('ar-SA')}</span>
              </div>
            </div>
            {r.status === 'new' ? (
              <button
                onClick={() => markHandled(r.id)}
                disabled={busyId === r.id}
                className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-primary/10 text-primary disabled:opacity-60"
              >
                تم التعامل معه
              </button>
            ) : (
              <span className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full bg-surface-container-highest text-on-surface-variant">
                تم التعامل معه
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
