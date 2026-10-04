import { useRef, useState } from 'react';
import { X, Upload, Download, Loader, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { parseCsv, mapHeaders, rowsToProducts, downloadCsv, EXPORT_HEADERS } from './csv';

// Under the server's default 100 KB JSON body limit even for long Arabic rows.
const CHUNK_SIZE = 200;
const MAX_ROWS = 5000;

const ERROR_LABELS = {
  name_required: 'الاسم فارغ',
  invalid_price: 'السعر غير صحيح',
};

function templateCsv(profile) {
  const sample = {
    food: ['شاورما دجاج', '15', 'سندويشات', 'وجبة', '', '', 'شاورما، دجاج', 'نعم'],
    pharmacy: ['بنادول 500 ملغ', '12.5', 'أدوية', 'علبة', 'GSK', '6281234567890', 'صداع، حرارة', 'نعم'],
    grocery: ['حليب طازج 1 لتر', '6.75', 'ألبان وأجبان', 'حبة', 'المراعي', '6281007030017', 'حليب', 'نعم'],
    services: ['قص شعر', '40', '', 'جلسة', '', '', 'حلاقة', 'نعم'],
  }[profile.id] || ['اسم المنتج', '25', '', 'حبة', '', '', '', 'نعم'];
  return `${EXPORT_HEADERS.join(',')}\r\n${sample.join(',')}`;
}

export default function ImportDialog({ authedFetch, businessId, profile, onClose, onImported }) {
  const [parsed, setParsed] = useState(null); // { products, unknown, missing }
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  function load(text) {
    setError('');
    setResult(null);
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setParsed(null);
      setError('الملف لازم يكون فيه سطر عناوين وسطر واحد على الأقل.');
      return;
    }
    const { mapping, unknown } = mapHeaders(rows[0]);
    const missing = ['name', 'price'].filter((f) => mapping[f] === undefined);
    const products = rowsToProducts(rows.slice(1, MAX_ROWS + 1), mapping);
    setParsed({ products, unknown, missing, truncated: rows.length - 1 > MAX_ROWS });
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError('احفظ الملف من Excel بصيغة CSV (ملف ← حفظ باسم ← CSV UTF-8) ثم ارفعه.');
      return;
    }
    load(await file.text());
  }

  async function runImport() {
    const products = parsed.products;
    const totals = { created: 0, updated: 0, failed: [] };
    setProgress({ done: 0, total: products.length });
    for (let start = 0; start < products.length; start += CHUNK_SIZE) {
      const chunk = products.slice(start, start + CHUNK_SIZE);
      const res = await authedFetch('/vendor/products/bulk', {
        method: 'POST',
        body: JSON.stringify({ businessId, rows: chunk }),
      });
      if (!res || !res.ok) {
        setProgress(null);
        setError(`توقف الاستيراد عند السطر ${start + 2}. اللي قبله انحفظ.`);
        setResult(totals);
        onImported();
        return;
      }
      const data = await res.json();
      totals.created += data.created;
      totals.updated += data.updated;
      // +2: one for the header line, one because spreadsheets count from 1.
      totals.failed.push(...data.failed.map((f) => ({ ...f, line: start + f.index + 2 })));
      setProgress({ done: Math.min(products.length, start + CHUNK_SIZE), total: products.length });
    }
    setProgress(null);
    setResult(totals);
    onImported();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-container-lowest rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
          <div>
            <h3 className="font-bold text-lg">استيراد {profile.itemsLabel} من ملف</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              ملف CSV من Excel أو Google Sheets. الموجود يتحدّث (بالباركود أو بالاسم) والجديد ينضاف.
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-transparent text-on-surface hover:bg-surface-container rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {!result && (
            <>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept=".csv,text/csv,.txt,.xlsx,.xls" onChange={pickFile} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold"
                >
                  <Upload className="w-4 h-4" /> اختر ملف CSV
                </button>
                <button
                  onClick={() => downloadCsv(`rico-template-${profile.id}.csv`, templateCsv(profile))}
                  className="flex items-center gap-2 bg-surface-container text-on-surface px-4 py-2.5 rounded-xl text-sm font-semibold"
                >
                  <Download className="w-4 h-4" /> نموذج جاهز
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-on-surface-variant">أو الصق الجدول هنا (من Excel مباشرة)</label>
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  onBlur={() => pasted.trim() && load(pasted)}
                  rows={4}
                  placeholder={EXPORT_HEADERS.join('\t')}
                  className="w-full bg-surface-container border-none rounded-xl px-4 py-3 text-xs font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <p className="text-xs text-on-surface-variant">
                الأعمدة المعروفة: الاسم، السعر (إلزاميان)، الفئة، الوحدة، الماركة، الباركود، الكلمات المفتاحية، متوفر (نعم/لا).
              </p>
            </>
          )}

          {error && <p className="text-sm text-error bg-error/5 rounded-xl px-4 py-3">{error}</p>}

          {parsed && !result && (
            <div className="space-y-3">
              {parsed.missing.length > 0 ? (
                <p className="text-sm text-error bg-error/5 rounded-xl px-4 py-3">
                  ما لقينا عمود {parsed.missing.map((f) => (f === 'name' ? '«الاسم»' : '«السعر»')).join(' و')} في سطر العناوين.
                </p>
              ) : (
                <p className="text-sm font-semibold">
                  {parsed.products.length} سطر جاهز للاستيراد
                  {parsed.truncated && <span className="text-error"> (أول {MAX_ROWS} سطر فقط)</span>}
                </p>
              )}
              {parsed.unknown.length > 0 && (
                <p className="text-xs text-on-surface-variant">أعمدة رح نتجاهلها: {parsed.unknown.join('، ')}</p>
              )}
              <div className="overflow-x-auto rounded-2xl border border-outline-variant">
                <table className="w-full text-xs">
                  <thead className="bg-surface-container">
                    <tr>
                      {['الاسم', 'السعر', 'الفئة', 'الوحدة', 'الباركود', 'متوفر'].map((h) => (
                        <th key={h} className="text-start px-3 py-2 font-bold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.products.slice(0, 8).map((p, i) => (
                      <tr key={i} className="border-t border-outline-variant">
                        <td className="px-3 py-2">{p.name || <span className="text-error">—</span>}</td>
                        <td className="px-3 py-2">{p.price || <span className="text-error">—</span>}</td>
                        <td className="px-3 py-2">{p.category || ''}</td>
                        <td className="px-3 py-2">{p.unit || ''}</td>
                        <td className="px-3 py-2 font-mono">{p.sku || ''}</td>
                        <td className="px-3 py-2">{p.inStock || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {progress && (
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <p className="text-xs text-on-surface-variant">
                {progress.done} / {progress.total}
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary font-bold">
                <CheckCircle2 className="w-5 h-5" /> انضاف {result.created} وتحدّث {result.updated}
              </div>
              {result.failed.length > 0 && (
                <div className="bg-error/5 rounded-2xl p-4 space-y-1">
                  <p className="text-sm font-bold text-error flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> {result.failed.length} سطر ما انحفظ
                  </p>
                  {result.failed.slice(0, 20).map((f) => (
                    <p key={f.line} className="text-xs">
                      سطر {f.line}: {f.name || '—'} — {ERROR_LABELS[f.error] || f.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-outline-variant bg-transparent text-on-surface font-semibold text-sm hover:bg-surface-container"
          >
            {result ? 'تم' : 'إلغاء'}
          </button>
          {!result && (
            <button
              onClick={runImport}
              disabled={!parsed || parsed.missing.length > 0 || parsed.products.length === 0 || !!progress}
              className="flex-1 bg-primary text-on-primary py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {progress && <Loader className="w-4 h-4 animate-spin" />}
              استيراد
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
