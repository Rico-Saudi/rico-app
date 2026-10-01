import { useState, useRef } from 'react';

const DEAL_TYPES = [
  { value: 'percent', label: 'نسبة خصم (٪)' },
  { value: 'fixed', label: 'خصم بمبلغ ثابت (ر.س)' },
  { value: 'bogo', label: 'اشتري واحصل على الثاني مجاناً' },
  { value: 'free_item', label: 'عنصر مجاني' },
  { value: 'bundle', label: 'عرض باقة' },
];

export default function SubmitDeal() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [titleAr, setTitleAr] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [dealType, setDealType] = useState('percent');
  const [value, setValue] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [status, setStatus] = useState(null); // { type, message }
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef(null);

  function handleQueryChange(e) {
    const q = e.target.value;
    setQuery(q);
    setNotFound(false);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => searchPlaces(q.trim()), 350);
  }

  async function searchPlaces(q) {
    try {
      const res = await fetch(`/places/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const places = data.places || [];
      setResults(places);
      setNotFound(places.length === 0);
    } catch {
      setResults([]);
      setNotFound(true);
    }
  }

  function selectPlace(p) {
    setSelectedPlace(p);
    setResults([]);
    setQuery('');
  }

  async function handleSubmit() {
    if (!selectedPlace) return setStatus({ type: 'error', message: 'اختر نشاطك التجاري أولاً.' });
    if (!titleAr.trim()) return setStatus({ type: 'error', message: 'اكتب عنوان العرض.' });

    setSubmitting(true);
    try {
      const res = await fetch('/submit-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: selectedPlace.id,
          titleAr: titleAr.trim(),
          descriptionAr: descriptionAr.trim() || null,
          dealType,
          value: value === '' ? null : Number(value),
          promoCode: promoCode.trim() || null,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', message: 'تم استلام عرضك ✅ سيتم مراجعته والتأكد منه قبل نشره للمستخدمين.' });
        setSelectedPlace(null);
        setTitleAr('');
        setDescriptionAr('');
        setValue('');
        setPromoCode('');
      } else {
        setStatus({ type: 'error', message: `تعذر إرسال العرض (${body.error || 'خطأ غير معروف'})` });
      }
    } catch {
      setStatus({ type: 'error', message: 'تعذر الاتصال بالخادم، حاول مرة أخرى.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>أضف عرضك في ريكو</h1>
        <p className="subtitle">عرّف عن عرضك أو خصمك — سيتم مراجعته قبل ظهوره للمستخدمين.</p>

        <label htmlFor="placeQuery">١. ابحث عن اسم نشاطك التجاري</label>
        <input
          id="placeQuery"
          type="text"
          placeholder="مثال: مطعم بيت المندي"
          autoComplete="off"
          value={query}
          onChange={handleQueryChange}
        />
        {results.map((p) => (
          <div key={p.id} className="place-option" onClick={() => selectPlace(p)}>
            {p.nameAr || p.name}
            {p.city && <small>{p.city}{p.district ? ` — ${p.district}` : ''}</small>}
          </div>
        ))}
        {notFound && (
          <div className="note">لم نجد نشاطك التجاري ضمن قاعدة بياناتنا حالياً. جرّب اسماً مختصراً أو بلا كلمة "مطعم/كافيه".</div>
        )}
        {selectedPlace && <div className="selected-place">✓ {selectedPlace.nameAr || selectedPlace.name}</div>}

        {selectedPlace && (
          <>
            <label htmlFor="titleAr">٢. عنوان العرض</label>
            <input id="titleAr" type="text" placeholder="مثال: خصم ٢٥٪ على المندي" maxLength={120}
              value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />

            <label htmlFor="descriptionAr">تفاصيل إضافية (اختياري)</label>
            <textarea id="descriptionAr" maxLength={300} placeholder="مثال: على جميع الأطباق عند الطلب من التطبيق"
              value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} />

            <label htmlFor="dealType">نوع العرض</label>
            <select id="dealType" value={dealType} onChange={(e) => setDealType(e.target.value)}>
              {DEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>

            <label htmlFor="value">القيمة (اتركه فارغاً إذا لا ينطبق)</label>
            <input id="value" type="number" min={0} max={100000} placeholder="مثال: 25"
              value={value} onChange={(e) => setValue(e.target.value)} />

            <label htmlFor="promoCode">كود خصم (اختياري)</label>
            <input id="promoCode" type="text" maxLength={30} value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />

            <button className="full" disabled={submitting} onClick={handleSubmit}>إرسال العرض للمراجعة</button>
          </>
        )}

        {status && <div className={`status ${status.type}`}>{status.message}</div>}
      </div>
    </div>
  );
}
