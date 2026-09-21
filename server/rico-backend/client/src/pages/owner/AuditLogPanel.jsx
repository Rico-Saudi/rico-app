import { useState, useEffect } from 'react';

const ACTION_LABELS = {
  'business.setActive': 'تفعيل/إيقاف نشاط',
  'claim.review': 'مراجعة طلب ربط',
  'deal.review': 'مراجعة عرض',
  'staff.create': 'إضافة حساب',
  'staff.update': 'تعديل حساب',
  'vendor.invite': 'دعوة صاحب نشاط',
  'learning.train': 'جولة تدريب لريكو',
  'learning.approve': 'اعتماد درس',
  'learning.reject': 'رفض اقتراح',
  'learning.retire': 'سحب درس من البرومبت',
  'learning.gapStatus': 'تغيير حالة سؤال',
};

function describeDetail(action, detail) {
  if (action === 'business.setActive') return detail.isActive ? 'تم التفعيل' : 'تم الإيقاف';
  if (action === 'claim.review' || action === 'deal.review') return `الحالة: ${detail.status}`;
  if (action === 'staff.create') return `${detail.email} (${detail.role === 'owner' ? 'مالك' : 'موظف'})`;
  if (action === 'staff.update') {
    const parts = [];
    if (detail.role) parts.push(`الصلاحية: ${detail.role === 'owner' ? 'مالك' : 'موظف'}`);
    if (detail.isActive !== undefined) parts.push(detail.isActive ? 'تفعيل' : 'إيقاف');
    return parts.join(' · ');
  }
  if (action === 'vendor.invite') return detail.email || '';
  if (action === 'learning.train') return `${detail.proposalsCreated ?? 0} اقتراح`;
  if (action === 'learning.gapStatus') return detail.status === 'ignored' ? 'تجاهُل' : 'رجّعه للطابور';
  if (action.startsWith('learning.')) return detail.message || '';
  return '';
}

export default function AuditLogPanel({ authedFetch }) {
  const [items, setItems] = useState(null); // null = loading
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 30;

  useEffect(() => {
    (async () => {
      const res = await authedFetch(`/owner/audit-log?page=${page}&limit=${limit}`);
      if (!res) return;
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    })();
  }, [authedFetch, page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="owner-wide-card">
      <h1 style={{ fontSize: 17 }}>سجل النشاطات ({total})</h1>
      {items === null && <p className="note">جاري التحميل...</p>}
      {items && items.length === 0 && <p className="note">لا توجد نشاطات مسجّلة بعد.</p>}
      {items && items.length > 0 && (
        <table>
          <thead>
            <tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>التفاصيل</th></tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr key={entry._id}>
                <td>{new Date(entry.createdAt).toLocaleString('ar-SA')}</td>
                <td>{entry.ownerEmail}</td>
                <td>{ACTION_LABELS[entry.action] || entry.action}</td>
                <td>{describeDetail(entry.action, entry.detail || {})}</td>
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
