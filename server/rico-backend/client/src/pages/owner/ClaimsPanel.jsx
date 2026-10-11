import { useState, useEffect, useCallback } from 'react';

export default function ClaimsPanel({ authedFetch }) {
  const [claims, setClaims] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const res = await authedFetch('/owner/claims/pending');
    if (!res) return;
    const data = await res.json();
    setClaims(data.claims || []);
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id, status) {
    setBusyId(id);
    await authedFetch(`/owner/claims/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    load();
  }

  return (
    <div className="owner-wide-card">
      <h1 style={{ fontSize: 17 }}>طلبات ربط الأنشطة قيد المراجعة ({claims?.length ?? 0})</h1>
      <p className="subtitle">طلبات ربط قدّمها صاحب نشاط بنفسه (وليس عبر دعوة من ريكو) — تحتاج مراجعتك قبل تفعيلها.</p>
      {claims === null && <p className="note">جاري التحميل...</p>}
      {claims && claims.length === 0 && <p className="note">لا توجد طلبات قيد المراجعة حالياً.</p>}
      {claims && claims.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>صاحب النشاط</th>
              <th>النشاط</th>
              <th>الهاتف</th>
              <th>تاريخ الطلب</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td>{c.vendorEmail}</td>
                <td>{c.placeName}</td>
                <td>{c.placePhone || '—'}</td>
                <td>{new Date(c.createdAt).toLocaleDateString('ar-SA')}</td>
                <td className="actions" style={{ width: 'auto' }}>
                  <button disabled={busyId === c.id} onClick={() => review(c.id, 'active')}>
                    قبول
                  </button>
                  <button className="secondary" disabled={busyId === c.id} onClick={() => review(c.id, 'rejected')}>
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
