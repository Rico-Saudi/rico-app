import { useRef, useState } from 'react';
import { Search, Store, Trash2, Upload } from 'lucide-react';
import { CLAIM_STATUS_LABELS } from './api';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, shrinkImage } from './imageUpload';

// The photo shoppers see next to this business in the Rico chat. Without one
// the app draws a category glyph — honest, but it makes a real partner look
// less real than a random Google result sitting beside it.
function StorefrontPhoto({ authedFetch, claim, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function pickFile(e) {
    const file = e.target.files?.[0];
    // Cleared immediately so re-picking the same file after an error still
    // fires a change event.
    e.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('الصيغ المقبولة: JPG أو PNG أو WebP');
      return;
    }

    setError('');
    setBusy(true);
    const shrunk = await shrinkImage(file);
    if (shrunk.size > MAX_IMAGE_BYTES) {
      setBusy(false);
      setError('الصورة كبيرة حتى بعد التصغير، جرّب صورة ثانية.');
      return;
    }

    const body = new FormData();
    body.append('image', shrunk);
    const res = await authedFetch(`/vendor/places/${claim.placeId}/image`, { method: 'POST', body });
    setBusy(false);
    if (!res) return;
    if (!res.ok) {
      setError('تعذّر رفع الصورة، حاول مرة ثانية.');
      return;
    }
    onChanged();
  }

  async function removePhoto() {
    setBusy(true);
    const res = await authedFetch(`/vendor/places/${claim.placeId}/image`, { method: 'DELETE' });
    setBusy(false);
    if (res?.ok) onChanged();
  }

  return (
    <div className="flex items-center gap-4">
      {claim.imageUrl ? (
        <img
          src={claim.imageUrl}
          alt={claim.placeName}
          className="w-20 h-20 rounded-2xl object-cover shrink-0 bg-surface-container"
        />
      ) : (
        <div className="w-20 h-20 rounded-2xl shrink-0 bg-surface-container flex items-center justify-center text-on-surface-variant/40">
          <Store className="w-7 h-7" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{claim.placeName}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">
          {claim.imageUrl ? 'تظهر للعملاء في نتائج ريكو' : 'ما فيه صورة — يظهر رمز الفئة بدلها'}
        </p>

        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-primary/10 text-primary disabled:opacity-50 flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            {busy ? 'جارٍ الرفع…' : claim.imageUrl ? 'تغيير الصورة' : 'رفع صورة'}
          </button>
          {claim.imageUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={removePhoto}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-surface-container text-on-surface-variant disabled:opacity-50 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف
            </button>
          )}
        </div>

        {error && <p className="text-xs text-error mt-1.5">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={pickFile}
        className="hidden"
      />
    </div>
  );
}

export default function SettingsTab({ authedFetch, me, onClaimed }) {
  // صورة المحل تفيد فقط النشاط المفعّل — غير المفعّل ما يظهر في نتائج البحث.
  const activeClaims = me.claims.filter((c) => c.status === 'active');
  const [claimQuery, setClaimQuery] = useState('');
  const [claimResults, setClaimResults] = useState([]);
  const [claimStatus, setClaimStatus] = useState(null);
  const debounceRef = useRef(null);

  function handleQueryChange(e) {
    const q = e.target.value;
    setClaimQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) return setClaimResults([]);
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/places/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setClaimResults(data.places || []);
    }, 350);
  }

  async function claimPlace(place) {
    setClaimResults([]);
    setClaimQuery('');
    const res = await authedFetch('/vendor/claim-place', {
      method: 'POST',
      body: JSON.stringify({ businessId: place.id }),
    });
    if (!res) return;
    const body = await res.json();
    if (res.ok) {
      setClaimStatus({ type: 'success', message: `تم إرسال طلب ربط "${place.nameAr || place.name}" بحسابك — بانتظار مراجعة فريق ريكو قبل التفعيل.` });
      onClaimed();
    } else {
      setClaimStatus({ type: 'error', message: body.error === 'already_claimed' ? 'هذا النشاط مربوط بحسابك بالفعل.' : 'تعذر إرسال الطلب.' });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold">الإعدادات</h1>
        <p className="text-on-surface-variant mt-1">{me.email}</p>
      </div>

      {activeClaims.length > 0 && (
        <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm space-y-5">
          <div>
            <h2 className="font-bold">صورة المحل</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              الصورة اللي يشوفها العميل بنتائج البحث في ريكو. صورة واضحة للواجهة أو من داخل المحل تفرق كثير.
            </p>
          </div>
          {activeClaims.map((c) => (
            <StorefrontPhoto key={c.placeId} authedFetch={authedFetch} claim={c} onChanged={onClaimed} />
          ))}
        </div>
      )}

      <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm space-y-4">
        <h2 className="font-bold">الأنشطة التجارية المرتبطة</h2>
        {me.claims.length === 0 && <p className="text-sm text-on-surface-variant">لا يوجد أي نشاط مرتبط بعد.</p>}
        {me.claims.map((c) => (
          <div key={c.placeId} className="flex items-center justify-between">
            <span className="text-sm font-semibold">{c.placeName}</span>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full ${
                c.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {CLAIM_STATUS_LABELS[c.status] || c.status}
            </span>
          </div>
        ))}

        <div className="pt-4 border-t border-outline-variant space-y-2">
          <label className="text-xs font-bold uppercase text-on-surface-variant">ربط نشاط تجاري جديد</label>
          <div className="relative">
            <Search className="absolute end-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
            <input
              type="text"
              placeholder="ابحث باسم النشاط"
              value={claimQuery}
              onChange={handleQueryChange}
              className="w-full bg-surface-container border-none rounded-xl px-4 py-3 pe-11 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
          {claimResults.map((p) => (
            <div
              key={p.id}
              onClick={() => claimPlace(p)}
              className="px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high cursor-pointer text-sm"
            >
              {p.nameAr || p.name}
              {p.city && <small className="block text-on-surface-variant">{p.city}{p.district ? ` — ${p.district}` : ''}</small>}
            </div>
          ))}
          {claimStatus && (
            <div className={`text-sm ${claimStatus.type === 'error' ? 'text-error' : 'text-primary'}`}>{claimStatus.message}</div>
          )}
        </div>
      </div>
    </div>
  );
}
