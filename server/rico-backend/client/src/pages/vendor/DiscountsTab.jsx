import { useEffect, useState } from 'react';
import { Plus, Percent } from 'lucide-react';
import { DISCOUNT_TYPES } from './api';

const emptyDiscountForm = () => ({ productId: '', type: 'percentage', value: '', startDate: '', endDate: '' });

export default function DiscountsTab({ authedFetch, activeClaims, activeBusinessId, onChangeBusiness }) {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [discounts, setDiscounts] = useState(null);
  const [form, setForm] = useState(emptyDiscountForm());
  const [status, setStatus] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (activeBusinessId) loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId]);

  useEffect(() => {
    if (selectedProductId) loadDiscounts(selectedProductId);
    else setDiscounts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId]);

  async function loadProducts() {
    const res = await authedFetch(`/vendor/products?businessId=${activeBusinessId}`);
    if (!res) return;
    const data = await res.json();
    setProducts(data.items || []);
    setSelectedProductId('');
  }

  async function loadDiscounts(productId) {
    setDiscounts(null);
    const res = await authedFetch(`/vendor/discounts?productId=${productId}`);
    if (!res) return;
    setDiscounts(await res.json());
  }

  async function submitDiscount(e) {
    e.preventDefault();
    const value = parseFloat(form.value);
    if (Number.isNaN(value) || value < 0) {
      setStatus({ type: 'error', message: 'أدخل قيمة صحيحة.' });
      return;
    }
    const res = await authedFetch('/vendor/discounts', {
      method: 'POST',
      body: JSON.stringify({
        productId: form.productId || selectedProductId,
        type: form.type,
        value,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      }),
    });
    if (res && res.ok) {
      setStatus({ type: 'success', message: 'تمت إضافة الخصم.' });
      setForm(emptyDiscountForm());
      setFormOpen(false);
      loadDiscounts(form.productId || selectedProductId);
    } else {
      setStatus({ type: 'error', message: 'تعذر إضافة الخصم.' });
    }
  }

  async function expireDiscount(id) {
    const res = await authedFetch(`/vendor/discounts/${id}/expire`, { method: 'PATCH' });
    if (res && res.ok) loadDiscounts(selectedProductId);
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
          <h1 className="text-3xl font-extrabold">الخصومات</h1>
          <p className="text-on-surface-variant mt-1">أدر خصومات منتجاتك.</p>
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">خصومات المنتجات</h2>
          </div>
          {products.length > 0 && (
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="bg-surface-container border-none rounded-xl py-2 px-4 text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="">اختر منتجاً</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {products.length === 0 && <p className="text-sm text-on-surface-variant">أضف منتجاً أولاً من تبويب المنتجات لإنشاء خصم عليه.</p>}

        {selectedProductId && (
          <>
            {discounts === null && <p className="text-sm text-on-surface-variant">جاري التحميل...</p>}
            {discounts && discounts.length === 0 && !formOpen && <p className="text-sm text-on-surface-variant">لا توجد خصومات لهذا المنتج.</p>}
            {discounts && discounts.length > 0 && (
              <div className="space-y-2">
                {discounts.map((d) => (
                  <div key={d._id} className="flex items-center justify-between bg-surface-container rounded-2xl px-4 py-3">
                    <span className="text-sm font-semibold">
                      {d.type === 'percentage' ? `${d.value}٪` : `${d.value} ر.س`}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${d.isActive ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                        {d.isActive ? 'نشط' : 'منتهي'}
                      </span>
                      {d.isActive && (
                        <button onClick={() => expireDiscount(d._id)} className="text-xs font-bold bg-transparent text-error">
                          إنهاء
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!formOpen ? (
              <button
                onClick={() => {
                  setForm({ ...emptyDiscountForm(), productId: selectedProductId });
                  setFormOpen(true);
                }}
                className="flex items-center gap-2 bg-transparent text-sm font-bold text-primary"
              >
                <Plus className="w-4 h-4" /> إضافة خصم
              </button>
            ) : (
              <form onSubmit={submitDiscount} className="space-y-3 bg-surface-container rounded-2xl p-4">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="bg-surface-container-lowest border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    {DISCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    placeholder="القيمة"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    className="bg-surface-container-lowest border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="bg-surface-container-lowest border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="bg-surface-container-lowest border-none rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormOpen(false)} className="flex-1 py-2.5 rounded-xl border border-outline-variant bg-transparent text-on-surface text-sm font-semibold">
                    إلغاء
                  </button>
                  <button type="submit" className="flex-1 bg-primary text-on-primary py-2.5 rounded-xl text-sm font-bold">
                    حفظ
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {status && <div className={`text-sm ${status.type === 'error' ? 'text-error' : 'text-primary'}`}>{status.message}</div>}
      </div>
    </div>
  );
}
