import { useState, useEffect } from 'react';
import { CATEGORY_LABELS } from './api';
import Sparkline from './Sparkline';

export default function BusinessesPanel({ authedFetch, onSelect }) {
  const [items, setItems] = useState(null); // null = loading
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const limit = 20;

  useEffect(() => {
    setPage(1);
  }, [search, category]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, category]);

  async function load() {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search.trim()) params.set('search', search.trim());
    if (category) params.set('categorySlug', category);
    const res = await authedFetch(`/owner/businesses?${params}`);
    if (!res) return;
    const data = await res.json();
    setItems(data.items || []);
    setTotal(data.total || 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="owner-wide-card">
      <div className="owner-toolbar">
        <h1 style={{ margin: 0 }}>الأنشطة التجارية ({total})</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="بحث بالاسم" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">كل الفئات</option>
            {Object.entries(CATEGORY_LABELS).map(([slug, label]) => (
              <option key={slug} value={slug}>{label}</option>
            ))}
          </select>
          <a href="/owner/businesses/export" download>
            <button className="secondary" type="button">تصدير CSV</button>
          </a>
        </div>
      </div>

      {items === null && <p className="note">جاري التحميل...</p>}
      {items && items.length === 0 && <p className="note">لا توجد أنشطة تجارية مطابقة.</p>}

      {items && items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الفئة</th>
              <th>المنتجات</th>
              <th>العروض النشطة</th>
              <th>المالك</th>
              <th>الحالة</th>
              <th>مؤشر الصحة</th>
              <th>الاتجاه (14 يوم)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b._id} className="clickable-row" onClick={() => onSelect(b._id)}>
                <td>{b.nameAr || b.name}</td>
                <td>{CATEGORY_LABELS[b.categorySlug] || b.categorySlug}</td>
                <td>{b.productsCount}</td>
                <td>{b.activeDealsCount}</td>
                <td>{b.ownerEmail || '—'}</td>
                <td><span className={`badge ${b.isActive ? 'active' : 'suspended'}`}>{b.isActive ? 'فعّال' : 'موقوف'}</span></td>
                <td>
                  <span className={`badge ${b.healthScore >= 70 ? 'active' : b.healthScore >= 40 ? 'pending_review' : 'suspended'}`}>
                    {b.healthScore}
                  </span>
                </td>
                <td><Sparkline data={b.sparkline} /></td>
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
