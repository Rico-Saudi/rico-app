import { useState, useEffect, useCallback } from 'react';
import { DEAL_TYPE_LABELS } from './api';

export default function DealsQueuePanel({ authedFetch }) {
  const [deals, setDeals] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const res = await authedFetch('/owner/deals/pending');
    if (!res) return;
    const data = await res.json();
    setDeals(data.deals || []);
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id, status) {
    setBusyId(id);
    await authedFetch(`/owner/deals/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    load();
  }

  return (
    <div className="owner-wide-card">
      <h1 style={{ fontSize: 17 }}>عروض قيد المراجعة ({deals?.length ?? 0})</h1>
      <p className="subtitle">عروض من مصادر تحتاج مراجعة بشرية (مثل الإرسال العام) — عروض لوحة أصحاب الأنشطة تُنشر مباشرة بلا مراجعة هنا.</p>
      {deals === null && <p className="note">جاري التحميل...</p>}
      {deals && deals.length === 0 && <p className="note">لا توجد عروض قيد المراجعة حالياً.</p>}
      {deals && deals.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>النشاط</th>
              <th>العرض</th>
              <th>النوع</th>
              <th>المصدر</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id}>
                <td>{d.placeName}</td>
                <td>{d.titleAr}</td>
                <td>{DEAL_TYPE_LABELS[d.dealType] || d.dealType}</td>
                <td>{d.source}</td>
                <td className="actions" style={{ width: 'auto' }}>
                  <button disabled={busyId === d.id} onClick={() => review(d.id, 'active')}>
                    قبول
                  </button>
                  <button className="secondary" disabled={busyId === d.id} onClick={() => review(d.id, 'rejected')}>
                    رفض
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
