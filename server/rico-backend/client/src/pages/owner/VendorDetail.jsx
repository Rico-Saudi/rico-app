import { useState, useEffect, useCallback } from 'react';
import { CLAIM_STATUS_LABELS, DEAL_STATUS_LABELS } from './api';

export default function VendorDetail({ authedFetch, accountId, onBack }) {
  const [data, setData] = useState(null); // null = loading

  const load = useCallback(async () => {
    const res = await authedFetch(`/owner/vendors/${accountId}`);
    if (!res) return;
    setData(await res.json());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (!data) return <div className="owner-wide-card"><p className="note">جاري التحميل...</p></div>;

  const { account, claims, deals } = data;

  return (
    <div>
      <button className="owner-back" onClick={onBack}>&rarr; رجوع للقائمة</button>

      <div className="owner-wide-card">
        <h1>{account.email}</h1>
        <p className="subtitle">
          {account.lastLoginAt ? `آخر دخول: ${new Date(account.lastLoginAt).toLocaleString('ar-SA')}` : 'لم يسجّل الدخول بعد'}
        </p>
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>الأنشطة المرتبطة ({claims.length})</h1>
        {claims.length === 0 && <p className="note">لا توجد أنشطة مرتبطة بهذا الحساب.</p>}
        {claims.map((c) => (
          <div key={c.id} className="row" style={{ marginTop: 10 }}>
            <span>{c.businessName || '—'}</span>
            <span className={`badge ${c.status}`}>{CLAIM_STATUS_LABELS[c.status] || c.status}</span>
          </div>
        ))}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>العروض المنشورة ({deals.length})</h1>
        {deals.length === 0 && <p className="note">لم ينشر هذا الحساب أي عروض بعد.</p>}
        {deals.map((d) => (
          <div key={d.id} className="row" style={{ marginTop: 10 }}>
            <div>
              <div>{d.titleAr}</div>
              <small style={{ color: '#888' }}>{d.businessName}</small>
            </div>
            <span className={`badge ${d.status}`}>{DEAL_STATUS_LABELS[d.status] || d.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
