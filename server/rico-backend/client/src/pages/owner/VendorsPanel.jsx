import { useState, useEffect } from 'react';

export default function VendorsPanel({ authedFetch, onSelect }) {
  const [items, setItems] = useState(null); // null = loading
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const limit = 20;

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  async function load() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search.trim()) params.set('search', search.trim());
    const res = await authedFetch(`/owner/vendors?${params}`);
    if (!res) return;
    const data = await res.json();
    setItems(data.items || []);
    setTotal(data.total || 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="owner-wide-card">
      <div className="owner-toolbar">
        <h1 style={{ margin: 0 }}>حسابات أصحاب الأنشطة ({total})</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="بحث بالبريد الإلكتروني" value={search} onChange={(e) => setSearch(e.target.value)} />
          <a href="/owner/vendors/export" download>
            <button className="secondary" type="button">تصدير CSV</button>
          </a>
        </div>
      </div>

      {items === null && <p className="note">جاري التحميل...</p>}
      {items && items.length === 0 && <p className="note">لا توجد حسابات مطابقة.</p>}

      {items && items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>البريد الإلكتروني</th>
              <th>الأنشطة المرتبطة (فعّالة)</th>
              <th>آخر دخول</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a._id} className="clickable-row" onClick={() => onSelect(a._id)}>
                <td>{a.email}</td>
                <td>{a.activeBusinessesCount}</td>
                <td>{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString('ar-SA') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {items && total > limit && (
        <div className="pagination">
          <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</button>
          <span>{page} / {totalPages}</span>
          <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</button>
        </div>
      )}
    </div>
  );
}
