import { useState, useEffect, useCallback } from 'react';
import { CATEGORY_LABELS, CLAIM_STATUS_LABELS, DEAL_STATUS_LABELS } from './api';
import ImpressionsChart from './ImpressionsChart';
import HeatmapChart from './HeatmapChart';

export default function BusinessDetail({ authedFetch, businessId, onBack }) {
  const [data, setData] = useState(null); // null = loading
  const [impressions, setImpressions] = useState(null); // null = loading
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    const res = await authedFetch(`/owner/businesses/${businessId}`);
    if (!res) return;
    setData(await res.json());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const loadImpressions = useCallback(async () => {
    const res = await authedFetch(`/owner/businesses/${businessId}/impressions?days=30`);
    if (!res) return;
    setImpressions(await res.json());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  useEffect(() => {
    setData(null);
    setImpressions(null);
    load();
    loadImpressions();
  }, [load, loadImpressions]);

  async function toggleActive() {
    await authedFetch(`/owner/businesses/${businessId}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !data.business.isActive }),
    });
    load();
  }

  async function inviteVendor(e) {
    e.preventDefault();
    setInviting(true);
    setInviteStatus(null);
    const res = await authedFetch('/owner/vendors/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, businessId }),
    });
    setInviting(false);
    if (res && res.ok) {
      setInviteStatus({ type: 'success', message: 'تم إرسال الدعوة — الحساب مُفعّل مباشرة لهذا النشاط.' });
      setInviteEmail('');
      load();
    } else {
      const body = res ? await res.json().catch(() => ({})) : {};
      setInviteStatus({
        type: 'error',
        message: body.error === 'email_already_exists' ? 'هذا البريد مستخدم بالفعل لحساب آخر.' : 'تعذر إرسال الدعوة.',
      });
    }
  }

  if (!data) return <div className="owner-wide-card"><p className="note">جاري التحميل...</p></div>;

  const { business, products, deals, claims } = data;

  return (
    <div>
      <button className="owner-back" onClick={onBack}>&rarr; رجوع للقائمة</button>

      <div className="owner-wide-card">
        <div className="row">
          <h1>{business.nameAr || business.name}</h1>
          <button className={business.isActive ? 'secondary' : ''} onClick={toggleActive}>
            {business.isActive ? 'إيقاف النشاط' : 'تفعيل النشاط'}
          </button>
        </div>
        <p className="subtitle">
          {CATEGORY_LABELS[business.categorySlug] || business.categorySlug}
          {business.city ? ` · ${business.city}` : ''}
          {business.district ? ` — ${business.district}` : ''}
        </p>
        <p style={{ fontSize: 13.5, color: '#666' }}>
          {business.phone ? `هاتف: ${business.phone}` : 'لا يوجد رقم هاتف مسجّل'}
        </p>
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>حسابات أصحاب النشاط ({claims.length})</h1>
        {claims.length === 0 && <p className="note">لا يوجد حساب مرتبط بهذا النشاط بعد.</p>}
        {claims.map((c) => (
          <div key={c.id} className="row" style={{ marginTop: 10 }}>
            <span>{c.accountEmail || '—'}</span>
            <span className={`badge ${c.status}`}>{CLAIM_STATUS_LABELS[c.status] || c.status}</span>
          </div>
        ))}

        <form onSubmit={inviteVendor} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #EEE' }}>
          <label htmlFor="inviteEmail">دعوة صاحب نشاط جديد (بريد إلكتروني)</label>
          <input
            id="inviteEmail"
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="vendor@example.com"
          />
          <button className="full" type="submit" disabled={inviting}>إرسال دعوة</button>
          {inviteStatus && <div className={`status ${inviteStatus.type}`}>{inviteStatus.message}</div>}
        </form>
      </div>

      <div className="owner-wide-card">
        <div className="row">
          <h1 style={{ fontSize: 17 }}>ظهور النشاط للمستخدمين (آخر 30 يوم)</h1>
          {impressions && <span className="stat-value" style={{ fontSize: 20 }}>{impressions.total}</span>}
        </div>
        {impressions === null && <p className="note">جاري التحميل...</p>}
        {impressions && impressions.total === 0 && (
          <p className="note">لم يظهر هذا النشاط لأي مستخدم بعد خلال آخر 30 يوم.</p>
        )}
        {impressions && impressions.total > 0 && <ImpressionsChart series={impressions.series} />}
      </div>

      {impressions && impressions.total > 0 && (
        <div className="owner-wide-card">
          <h1 style={{ fontSize: 17 }}>أوقات الظهور الأكثر نشاطاً</h1>
          <p className="subtitle">اليوم والساعة (بتوقيت UTC) اللذان يظهر فيهما هذا النشاط أكثر للمستخدمين.</p>
          <HeatmapChart heatmap={impressions.heatmap} />
        </div>
      )}

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>المنتجات ({products.length})</h1>
        {products.length === 0 && <p className="note">لا توجد منتجات مسجّلة.</p>}
        {products.length > 0 && (
          <table>
            <thead>
              <tr><th>الاسم</th><th>السعر</th><th>السعر بعد الخصم</th><th>خصومات نشطة</th></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p._id}>
                  <td>{p.name}</td>
                  <td>{p.price}</td>
                  <td>{p.finalPrice}</td>
                  <td>{p.discounts.filter((d) => d.isActive).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>العروض ({deals.length})</h1>
        {deals.length === 0 && <p className="note">لا توجد عروض لهذا النشاط.</p>}
        {deals.map((d) => (
          <div key={d._id} className="row" style={{ marginTop: 10 }}>
            <div>{d.titleAr}</div>
            <span className={`badge ${d.status}`}>{DEAL_STATUS_LABELS[d.status] || d.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
