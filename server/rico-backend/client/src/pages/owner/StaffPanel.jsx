import { useState, useEffect, useCallback } from 'react';

const ROLE_LABELS = { owner: 'مالك', staff: 'موظف' };

export default function StaffPanel({ authedFetch, currentOwnerId }) {
  const [items, setItems] = useState(null); // null = loading
  const [form, setForm] = useState({ email: '', password: '', role: 'staff' });
  const [formStatus, setFormStatus] = useState(null);

  const load = useCallback(async () => {
    const res = await authedFetch('/owner/staff');
    if (!res) return;
    setItems((await res.json()).items);
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormStatus(null);
    const res = await authedFetch('/owner/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res) return;
    if (res.ok) {
      setFormStatus({ type: 'success', message: 'تمت إضافة الحساب.' });
      setForm({ email: '', password: '', role: 'staff' });
      load();
    } else {
      const body = await res.json();
      setFormStatus({
        type: 'error',
        message: body.error === 'email_already_exists' ? 'هذا البريد الإلكتروني مستخدم بالفعل.' : 'تعذر إضافة الحساب.',
      });
    }
  }

  async function toggleActive(item) {
    await authedFetch(`/owner/staff/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    load();
  }

  async function toggleRole(item) {
    await authedFetch(`/owner/staff/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: item.role === 'owner' ? 'staff' : 'owner' }),
    });
    load();
  }

  return (
    <div>
      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>إضافة حساب جديد</h1>
        <form onSubmit={handleCreate}>
          <label htmlFor="staffEmail">البريد الإلكتروني</label>
          <input id="staffEmail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label htmlFor="staffPassword">كلمة المرور</label>
          <input
            id="staffPassword"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <label htmlFor="staffRole">الصلاحية</label>
          <select id="staffRole" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="staff">موظف</option>
            <option value="owner">مالك</option>
          </select>
          <button className="full" type="submit">إضافة</button>
        </form>
        {formStatus && <div className={`status ${formStatus.type}`}>{formStatus.message}</div>}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>الحسابات ({items?.length ?? 0})</h1>
        {items === null && <p className="note">جاري التحميل...</p>}
        {items && items.length > 0 && (
          <table>
            <thead>
              <tr><th>البريد الإلكتروني</th><th>الصلاحية</th><th>الحالة</th><th>آخر دخول</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.email}</td>
                  <td>{ROLE_LABELS[item.role] || item.role}</td>
                  <td><span className={`badge ${item.isActive ? 'active' : 'suspended'}`}>{item.isActive ? 'فعّال' : 'موقوف'}</span></td>
                  <td>{item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleDateString('ar-SA') : '—'}</td>
                  <td className="actions" style={{ width: 'auto' }}>
                    <button
                      className="secondary"
                      disabled={item.id === currentOwnerId}
                      onClick={() => toggleRole(item)}
                    >
                      {item.role === 'owner' ? 'خفض لموظف' : 'ترقية لمالك'}
                    </button>
                    <button
                      className="secondary"
                      disabled={item.id === currentOwnerId}
                      onClick={() => toggleActive(item)}
                    >
                      {item.isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
