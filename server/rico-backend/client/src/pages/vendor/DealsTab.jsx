import { useEffect, useState } from 'react';
import { Plus, Loader, Tag } from 'lucide-react';
import { DEAL_TYPES, DEAL_STATUS_LABELS, WEATHER_CONDITIONS } from './api';

// weatherConditions = [] means "always show", which is what every deal did
// before weather targeting existed.
const emptyDealForm = () => ({ titleAr: '', descriptionAr: '', dealType: 'percent', value: '', promoCode: '', weatherConditions: [] });

export default function DealsTab({ authedFetch, activeClaims, activeBusinessId, onChangeBusiness }) {
  const [deals, setDeals] = useState(null);
  const [form, setForm] = useState(emptyDealForm());
  const [formOpen, setFormOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const res = await authedFetch('/vendor/deals');
    if (!res) return;
    const data = await res.json();
    setDeals(data.deals || []);
  }

  async function submitDeal(e) {
    e.preventDefault();
    setSaving(true);
    const res = await authedFetch('/vendor/deals', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        businessId: activeBusinessId,
        value: form.value === '' ? null : Number(form.value),
        weatherConditions: form.weatherConditions.length ? form.weatherConditions : undefined,
      }),
    });
    setSaving(false);
    if (res && res.ok) {
      setStatus({ type: 'success', message: 'تمت إضافة العرض ونُشر مباشرة.' });
      setForm(emptyDealForm());
      setFormOpen(false);
      load();
    } else {
      setStatus({ type: 'error', message: 'تعذر إضافة العرض.' });
    }
  }

  async function expireDeal(id) {
    const res = await authedFetch(`/vendor/deals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'expired' }) });
    if (res && res.ok) load();
  }

  if (activeClaims.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-3xl p-8 text-center">
        <p className="text-on-surface-variant">لا يوجد نشاط تجاري مُفعّل بعد. اربط نشاطك من تبويب الإعدادات أولاً.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">العروض</h1>
          <p className="text-on-surface-variant mt-1">أدر عروضك العامة (نسبة خصم، اشتري واحصل على الثاني، وغيرها).</p>
        </div>
        {activeClaims.length > 1 && (
          <select
            value={activeBusinessId || ''}
            onChange={(e) => onChangeBusiness(e.target.value)}
            className="bg-surface-container-high border-none rounded-xl py-2.5 px-4 text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
          >
            {activeClaims.map((c) => (
              <option key={c.placeId} value={c.placeId}>
                {c.placeName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">قائمة العروض</h2>
          </div>
          {!formOpen && (
            <button onClick={() => setFormOpen(true)} className="flex items-center gap-2 bg-transparent text-sm font-bold text-primary">
              <Plus className="w-4 h-4" /> إضافة عرض
            </button>
          )}
        </div>

        {formOpen && (
          <form onSubmit={submitDeal} className="space-y-3 bg-surface-container rounded-2xl p-4">
            <input
              required
              maxLength={120}
              placeholder="عنوان العرض"
              value={form.titleAr}
              onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
              className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <textarea
              maxLength={300}
              placeholder="تفاصيل إضافية (اختياري)"
              value={form.descriptionAr}
              onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
              className="w-full bg-surface-container-lowest border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={form.dealType}
                onChange={(e) => setForm({ ...form, dealType: e.target.value })}
                className="bg-surface-container-lowest border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              >
                {DEAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={100000}
                placeholder="القيمة (اختياري)"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                className="bg-surface-container-lowest border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-on-surface-variant">
                اعرضه بس لما يكون الجو… <span className="font-normal">(اختياري — بدون اختيار يظهر دايماً)</span>
              </label>
              <div className="flex flex-wrap gap-2 mt-2">
                {WEATHER_CONDITIONS.map((w) => {
                  const picked = form.weatherConditions.includes(w.value);
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          weatherConditions: picked
                            ? form.weatherConditions.filter((v) => v !== w.value)
                            : [...form.weatherConditions, w.value],
                        })
                      }
                      className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${
                        picked ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="flex-1 py-2.5 rounded-xl border border-outline-variant bg-transparent text-on-surface text-sm font-semibold">
                إلغاء
              </button>
              <button type="submit" disabled={saving} className="flex-1 bg-primary text-on-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                {saving && <Loader className="w-4 h-4 animate-spin" />}
                نشر العرض
              </button>
            </div>
          </form>
        )}

        {status && <div className={`text-sm ${status.type === 'error' ? 'text-error' : 'text-primary'}`}>{status.message}</div>}

        {deals === null && <p className="text-sm text-on-surface-variant">جاري التحميل...</p>}
        {deals && deals.length === 0 && <p className="text-sm text-on-surface-variant">لا توجد عروض بعد.</p>}
        {deals && deals.length > 0 && (
          <div className="space-y-2">
            {deals.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-surface-container rounded-2xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{d.titleAr}</p>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${d.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                    {DEAL_STATUS_LABELS[d.status] || d.status}
                  </span>
                </div>
                {d.status === 'active' && (
                  <button onClick={() => expireDeal(d.id)} className="text-xs font-bold bg-transparent text-error">
                    إنهاء العرض
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
