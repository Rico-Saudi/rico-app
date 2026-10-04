import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Edit2, X, Package, Loader, ImagePlus, Search, Upload, Download } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, shrinkImage } from './imageUpload';
import ImportDialog from './ImportDialog';
import { downloadCsv, productsToCsv } from './csv';

const PAGE_SIZE = 60;

// imageFile = a newly picked photo not uploaded yet; imageUrl = the one already
// stored on the product; removeImage = the vendor cleared an existing photo.
const emptyForm = (name = '') => ({
  name,
  category: '',
  price: '',
  unit: '',
  brand: '',
  sku: '',
  inStock: true,
  attributes: {},
  keywords: '',
  imageFile: null,
  imageUrl: null,
  removeImage: false,
});

function toKeywordsArray(text) {
  return text
    .split(/[,،]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

const inputClass =
  'w-full bg-surface-container border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none';

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-on-surface-variant">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-surface-container-highest'
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'start-5' : 'start-1'}`}
      />
    </button>
  );
}

// One input per attribute the vertical defines — the dashboard's only
// difference between, say, a pharmacy's product form and a barber's.
function AttributeInput({ def, value, onChange }) {
  if (def.type === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-3 bg-surface-container rounded-xl px-4 py-3 text-sm font-medium">
        {def.label}
        <Toggle checked={!!value} onChange={onChange} label={def.label} />
      </label>
    );
  }
  if (def.type === 'select') {
    return (
      <Field label={def.label}>
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">—</option>
          {def.options.map((o) => {
            const { value: v, label } = typeof o === 'string' ? { value: o, label: o } : o;
            return (
              <option key={v} value={v}>
                {label}
              </option>
            );
          })}
        </select>
      </Field>
    );
  }
  return (
    <Field label={def.label}>
      <input
        type={def.type === 'number' ? 'number' : 'text'}
        min={def.type === 'number' ? 0 : undefined}
        value={value ?? ''}
        placeholder={def.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

// Attribute values travel typed: a number field as a number, an emptied
// field dropped, so the server never stores "" for "not set". Attributes the
// form doesn't show (set by an import, or by an older form) pass through
// untouched rather than being wiped by an unrelated edit.
function attributesPayload(defs, values) {
  const shown = new Set(defs.map((d) => d.key));
  const out = Object.fromEntries(Object.entries(values).filter(([key]) => !shown.has(key)));
  for (const def of defs) {
    const v = values[def.key];
    if (def.type === 'boolean') {
      if (v) out[def.key] = true;
    } else if (def.type === 'number') {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) out[def.key] = n;
    } else if (v != null && String(v).trim()) {
      out[def.key] = String(v).trim();
    }
  }
  return out;
}

export default function ProductsTab({
  authedFetch,
  activeClaims,
  activeBusinessId,
  onChangeBusiness,
  profile,
  prefillName,
  onPrefillConsumed,
}) {
  const [products, setProducts] = useState(null); // null = loading
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [shopCategories, setShopCategories] = useState([]);
  const [outOfStock, setOutOfStock] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState(''); // '' | 'in' | 'out'
  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // object URL for a freshly picked file
  const fileInputRef = useRef(null);
  const loadSeq = useRef(0);

  // Object URLs are leaked unless they're released when the picked file changes
  // or the panel closes.
  useEffect(() => {
    if (!form.imageFile) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(form.imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form.imageFile]);

  // Typing in the search box waits for a pause before asking the server.
  useEffect(() => {
    if (!activeBusinessId) return undefined;
    const t = setTimeout(() => load(1), query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId, query, category, stock]);

  // Arriving from the overview's "your customers asked for X" list.
  useEffect(() => {
    if (prefillName && activeBusinessId) {
      openAdd(prefillName);
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillName, activeBusinessId]);

  function listUrl(pageNumber, limit = PAGE_SIZE) {
    const params = new URLSearchParams({ businessId: activeBusinessId, page: String(pageNumber), limit: String(limit) });
    if (query.trim()) params.set('q', query.trim());
    if (category) params.set('category', category);
    if (stock) params.set('stock', stock);
    return `/vendor/products?${params}`;
  }

  async function load(pageNumber = 1) {
    // A slow response for an old filter must not overwrite a newer one.
    const seq = ++loadSeq.current;
    if (pageNumber === 1) setProducts(null);
    const res = await authedFetch(listUrl(pageNumber));
    if (!res || seq !== loadSeq.current) return;
    const data = await res.json();
    setProducts((prev) => (pageNumber === 1 ? data.items || [] : [...(prev || []), ...(data.items || [])]));
    setTotal(data.total ?? 0);
    setPage(pageNumber);
    setShopCategories(data.categories || []);
    setOutOfStock(data.outOfStock ?? 0);
  }

  function openAdd(name = '') {
    setEditingId(null);
    setForm(emptyForm(typeof name === 'string' ? name : ''));
    setError('');
    setPanelOpen(true);
  }

  function openEdit(p) {
    setEditingId(p._id);
    setForm({
      name: p.name,
      category: p.category || '',
      price: String(p.price),
      unit: p.unit || '',
      brand: p.brand || '',
      sku: p.sku || '',
      inStock: p.inStock !== false,
      attributes: { ...(p.attributes || {}) },
      keywords: (p.keywords || []).join(', '),
      imageFile: null,
      imageUrl: p.imageUrl || null,
      removeImage: false,
    });
    setError('');
    setPanelOpen(true);
  }

  async function handlePickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so re-picking the same file still fires onChange
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('يُقبل فقط ملف بصيغة JPG أو PNG أو WebP.');
      return;
    }
    const shrunk = await shrinkImage(file);
    if (shrunk.size > MAX_IMAGE_BYTES) {
      setError('حجم الصورة كبير جداً (الحد الأقصى ٢ ميجابايت).');
      return;
    }
    setError('');
    setForm((f) => ({ ...f, imageFile: shrunk, removeImage: false }));
  }

  function handleClearImage() {
    setForm((f) => ({ ...f, imageFile: null, removeImage: true }));
  }

  // Runs after the product itself is saved, since both endpoints are keyed by
  // the product id — which only exists once the create call has returned.
  async function syncImage(productId) {
    if (form.imageFile) {
      const body = new FormData();
      body.append('image', form.imageFile);
      return authedFetch(`/vendor/products/${productId}/image`, { method: 'POST', body });
    }
    if (form.removeImage && form.imageUrl) {
      return authedFetch(`/vendor/products/${productId}/image`, { method: 'DELETE' });
    }
    return { ok: true };
  }

  // A freshly picked file wins over the stored photo; clearing shows the empty
  // picker even though the product still has an image until save.
  const currentImage = preview || (form.removeImage ? null : form.imageUrl);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const price = parseFloat(form.price);
    if (!form.name.trim() || Number.isNaN(price) || price < 0) {
      setError('يرجى إدخال اسم وسعر صحيحين.');
      setSaving(false);
      return;
    }
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      price,
      unit: form.unit.trim() || null,
      inStock: form.inStock,
      attributes: attributesPayload(profile.attributes, form.attributes),
      keywords: toKeywordsArray(form.keywords),
      ...(profile.fields.brand ? { brand: form.brand.trim() || null } : {}),
      ...(profile.fields.sku ? { sku: form.sku.trim() || null } : {}),
    };
    const res = editingId
      ? await authedFetch(`/vendor/products/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await authedFetch('/vendor/products', { method: 'POST', body: JSON.stringify({ ...payload, businessId: activeBusinessId }) });
    if (!res || !res.ok) {
      setSaving(false);
      setError(`تعذر حفظ ${profile.itemSingular}.`);
      return;
    }

    const saved = await res.json();
    const imageRes = await syncImage(editingId || saved._id);
    setSaving(false);
    // The product is already saved at this point, so the panel closes either
    // way — only the photo is reported as failed, and it can be retried by
    // editing the product again.
    if (!imageRes || !imageRes.ok) {
      setError('تم الحفظ، لكن تعذر رفع الصورة.');
      load(1);
      return;
    }
    setPanelOpen(false);
    load(1);
  }

  async function handleDelete(id) {
    if (!confirm(`هل تريد حذف هذا ${profile.itemSingular}؟`)) return;
    const res = await authedFetch(`/vendor/products/${id}`, { method: 'DELETE' });
    if (res && res.ok) load(1);
  }

  // Flipped in place rather than reloading the list: a shop marking ten items
  // sold out at closing time shouldn't watch the grid redraw ten times.
  async function toggleStock(p) {
    const next = p.inStock === false;
    setTogglingId(p._id);
    const res = await authedFetch(`/vendor/products/${p._id}`, { method: 'PATCH', body: JSON.stringify({ inStock: next }) });
    setTogglingId(null);
    if (!res || !res.ok) return;
    setProducts((list) => list.map((x) => (x._id === p._id ? { ...x, inStock: next } : x)));
    setOutOfStock((n) => n + (next ? -1 : 1));
  }

  async function exportCsv() {
    setExporting(true);
    const all = [];
    for (let pageNumber = 1; ; pageNumber++) {
      const params = new URLSearchParams({ businessId: activeBusinessId, page: String(pageNumber), limit: '100' });
      const res = await authedFetch(`/vendor/products?${params}`);
      if (!res || !res.ok) break;
      const data = await res.json();
      all.push(...data.items);
      if (all.length >= data.total || data.items.length === 0) break;
    }
    setExporting(false);
    const shop = activeClaims.find((c) => String(c.placeId) === String(activeBusinessId));
    downloadCsv(`${shop?.placeName || 'rico'}-${profile.itemsLabel}.csv`, productsToCsv(all));
  }

  if (activeClaims.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-3xl p-8 text-center">
        <p className="text-on-surface-variant">لا يوجد نشاط تجاري مُفعّل بعد. اربط نشاطك من تبويب الإعدادات أولاً.</p>
      </div>
    );
  }

  const categorySuggestions = [...new Set([...shopCategories, ...profile.categories])];
  const filtering = query.trim() || category || stock;

  return (
    <div className="relative">
      <div className={`space-y-6 transition-all ${panelOpen ? 'lg:pe-[400px]' : ''}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">{profile.itemsLabel}</h1>
            <p className="text-on-surface-variant mt-1">{profile.itemsHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 bg-surface-container-high text-on-surface px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-highest"
            >
              <Upload className="w-4 h-4" /> استيراد
            </button>
            <button
              onClick={exportCsv}
              disabled={exporting || total === 0}
              className="flex items-center gap-2 bg-surface-container-high text-on-surface px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-highest disabled:opacity-50"
            >
              {exporting ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} تصدير
            </button>
            <button
              onClick={() => openAdd()}
              className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> {profile.addItem}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={profile.fields.sku ? 'ابحث بالاسم أو الباركود أو الماركة' : 'ابحث بالاسم'}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl ps-9 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
          {shopCategories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-surface-container-lowest border border-outline-variant rounded-xl py-2.5 px-4 text-sm font-semibold outline-none"
            >
              <option value="">كل الفئات</option>
              {shopCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <div className="flex bg-surface-container rounded-xl p-1 text-xs font-bold">
            {[
              ['', 'الكل'],
              ['in', 'متوفر'],
              ['out', `نفد${outOfStock ? ` (${outOfStock})` : ''}`],
            ].map(([value, label]) => (
              <button
                key={value || 'all'}
                onClick={() => setStock(value)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  stock === value ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'bg-transparent text-on-surface-variant'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {products === null && <p className="text-on-surface-variant">جاري التحميل...</p>}
        {products && products.length === 0 && (
          <div className="bg-surface-container-lowest rounded-3xl p-8 text-center">
            <Package className="w-8 h-8 mx-auto text-on-surface-variant/40 mb-2" />
            <p className="text-on-surface-variant">{filtering ? 'ما فيه نتائج بهذا البحث.' : profile.emptyItems}</p>
          </div>
        )}
        {products && products.length > 0 && (
          <p className="text-xs text-on-surface-variant">
            {products.length} من {total}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {products?.map((p) => {
            const soldOut = p.inStock === false;
            return (
              <div key={p._id} className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm group">
                <div className="relative mb-4">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      loading="lazy"
                      className={`w-full h-36 object-cover rounded-2xl bg-surface-container ${soldOut ? 'grayscale opacity-60' : ''}`}
                    />
                  ) : (
                    <div className="w-full h-36 rounded-2xl bg-surface-container flex items-center justify-center">
                      <Package className="w-7 h-7 text-on-surface-variant/30" />
                    </div>
                  )}
                  {soldOut && (
                    <span className="absolute top-2 start-2 text-[11px] font-bold px-2 py-1 rounded-lg bg-on-surface text-surface">نفد</span>
                  )}
                  {p.attributes?.requiresPrescription && (
                    <span className="absolute top-2 end-2 text-[11px] font-bold px-2 py-1 rounded-lg bg-surface/90">وصفة طبية</span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold leading-tight truncate">{p.name}</h3>
                    <p className="text-xs text-on-surface-variant truncate">
                      {[p.brand, p.category].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      aria-label="تعديل"
                      className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p._id)}
                      aria-label="حذف"
                      className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-error"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-lg font-extrabold text-primary">{p.finalPrice} ر.س</span>
                    {p.unit && <span className="text-xs text-on-surface-variant">/ {p.unit}</span>}
                    {p.finalPrice !== p.price && <span className="text-xs text-on-surface-variant line-through">{p.price}</span>}
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                    {soldOut ? 'نفد' : 'متوفر'}
                    <Toggle
                      checked={!soldOut}
                      disabled={togglingId === p._id}
                      onChange={() => toggleStock(p)}
                      label={`توفر ${p.name}`}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {products && products.length < total && (
          <div className="text-center">
            <button
              onClick={() => load(page + 1)}
              className="px-6 py-2.5 rounded-xl bg-surface-container-high text-sm font-bold hover:bg-surface-container-highest"
            >
              عرض المزيد
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ x: -400 }}
            animate={{ x: 0 }}
            exit={{ x: -400 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 h-screen w-full sm:w-[380px] bg-surface-container-lowest shadow-2xl z-30 flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
              <h3 className="font-bold text-lg">{editingId ? `تعديل ${profile.itemSingular}` : profile.addItem}</h3>
              <button onClick={() => setPanelOpen(false)} className="p-2 bg-transparent text-on-surface hover:bg-surface-container rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              <Field label="الصورة (اختياري)">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  onChange={handlePickImage}
                  className="hidden"
                />
                {currentImage ? (
                  <div className="relative group/img">
                    <img src={currentImage} alt="" className="w-full h-44 object-cover rounded-2xl bg-surface-container" />
                    <div className="absolute inset-x-0 bottom-0 p-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 bg-surface/90 backdrop-blur text-on-surface py-2 rounded-xl text-xs font-bold"
                      >
                        تغيير
                      </button>
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="px-3 bg-surface/90 backdrop-blur text-error py-2 rounded-xl text-xs font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-44 rounded-2xl bg-surface-container border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-2 text-on-surface-variant hover:border-primary/40 transition-colors"
                  >
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-xs font-semibold">اختر صورة (JPG أو PNG أو WebP)</span>
                  </button>
                )}
              </Field>

              <Field label="الاسم">
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="السعر (ر.س)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className={`${inputClass} font-bold`}
                  />
                </Field>
                <Field label="لكل">
                  <input
                    type="text"
                    list="unit-options"
                    value={form.unit}
                    placeholder={profile.units[0]}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className={inputClass}
                  />
                  <datalist id="unit-options">
                    {profile.units.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </Field>
              </div>

              <Field label="الفئة (اختياري)">
                <input
                  type="text"
                  list="category-options"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className={inputClass}
                />
                <datalist id="category-options">
                  {categorySuggestions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>

              {(profile.fields.brand || profile.fields.sku) && (
                <div className="grid grid-cols-2 gap-3">
                  {profile.fields.brand && (
                    <Field label="الماركة">
                      <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className={inputClass} />
                    </Field>
                  )}
                  {profile.fields.sku && (
                    <Field label="الباركود / الكود">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.sku}
                        onChange={(e) => setForm({ ...form, sku: e.target.value })}
                        className={`${inputClass} font-mono`}
                      />
                    </Field>
                  )}
                </div>
              )}

              <label className="flex items-center justify-between gap-3 bg-surface-container rounded-xl px-4 py-3 text-sm font-medium">
                متوفر الآن
                <Toggle checked={form.inStock} onChange={(v) => setForm({ ...form, inStock: v })} label="متوفر الآن" />
              </label>

              {profile.attributes.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs font-bold text-on-surface-variant">تفاصيل إضافية</p>
                  {profile.attributes.map((def) => (
                    <AttributeInput
                      key={def.key}
                      def={def}
                      value={form.attributes[def.key]}
                      onChange={(v) => setForm((f) => ({ ...f, attributes: { ...f.attributes, [def.key]: v } }))}
                    />
                  ))}
                </div>
              )}

              <Field label="كلمات مفتاحية (اختياري، مفصولة بفاصلة)">
                <input
                  type="text"
                  value={form.keywords}
                  placeholder="كلمات يبحث فيها العملاء عن هذا"
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  className={inputClass}
                />
              </Field>
              {error && <p className="text-sm text-error bg-error/5 rounded-xl px-4 py-3">{error}</p>}
            </form>
            <div className="px-6 py-5 border-t border-outline-variant flex gap-3">
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="flex-1 py-3 rounded-xl border border-outline-variant bg-transparent text-on-surface font-semibold text-sm hover:bg-surface-container"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-primary text-on-primary py-3 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader className="w-4 h-4 animate-spin" />}
                حفظ
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {importOpen && (
        <ImportDialog
          authedFetch={authedFetch}
          businessId={activeBusinessId}
          profile={profile}
          onClose={() => setImportOpen(false)}
          onImported={() => load(1)}
        />
      )}
    </div>
  );
}
