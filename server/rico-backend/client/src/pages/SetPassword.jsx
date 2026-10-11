import { useState } from 'react';
import { KeyRound } from 'lucide-react';

// Serves both flows with one form: an owner-invited/vendor-invited account's
// first "set your password" link, and a later "forgot my password" reset —
// both consume the same backend token type (POST /auth/set-password), so
// there's no need for the UI to know or care which one this particular link
// was for.
export default function SetPassword({ loginPath }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) {
      setStatus({ type: 'error', message: 'كلمة المرور يجب أن تكون ٨ أحرف على الأقل.' });
      return;
    }
    if (password !== confirm) {
      setStatus({ type: 'error', message: 'كلمتا المرور غير متطابقتين.' });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch('/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        setStatus({ type: 'error', message: 'الرابط غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.' });
        return;
      }
      setDone(true);
    } catch {
      setStatus({ type: 'error', message: 'تعذر الاتصال بالخادم، حاول مرة أخرى.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4" dir="rtl">
      <div className="bg-surface-container-lowest rounded-3xl shadow-lg p-8 max-w-sm w-full space-y-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-primary">تعيين كلمة المرور</h1>
        </div>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-on-surface-variant">تم تعيين كلمة المرور بنجاح.</p>
            <a href={loginPath}>
              <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-2xl hover:opacity-90 transition-opacity">
                تسجيل الدخول
              </button>
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-on-surface-variant">كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-on-surface-variant">تأكيد كلمة المرور</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-surface-container border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              />
            </div>

            {status && <div className="text-sm rounded-xl px-4 py-3 text-error bg-error/5">{status.message}</div>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-on-primary font-bold py-3 rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              حفظ كلمة المرور
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
