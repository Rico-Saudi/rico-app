import { useState } from 'react';
import { Eye, EyeOff, Store } from 'lucide-react';

export default function VendorLogin() {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, app: 'vendor' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          body.error === 'wrong_app'
            ? 'هذا الحساب ليس حساب نشاط تجاري — تواصل مع فريق ريكو.'
            : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        setStatus({ type: 'error', message });
        return;
      }
      window.location.href = '/vendor/dashboard';
    } catch {
      setStatus({ type: 'error', message: 'تعذر الاتصال بالخادم، حاول مرة أخرى.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, app: 'vendor' }),
      });
      const body = await res.json();
      setStatus({ type: 'success', message: body.message || 'إذا كان هذا البريد مسجلاً، سنرسل رابطاً لإعادة تعيين كلمة المرور.' });
    } catch {
      setStatus({ type: 'error', message: 'تعذر الاتصال بالخادم، حاول مرة أخرى.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4" dir="rtl">
      <div className="bg-surface-container-lowest rounded-3xl shadow-lg p-8 max-w-sm w-full space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <Store className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold text-primary">لوحة النشاط التجاري</h1>
          <p className="text-sm text-on-surface-variant">
            {mode === 'login' ? 'سجّل الدخول لإدارة منتجاتك وخصوماتك وعروضك.' : 'أدخل بريدك الإلكتروني لإعادة تعيين كلمة المرور.'}
          </p>
        </div>

        <form onSubmit={mode === 'login' ? handleLogin : handleForgot} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase text-on-surface-variant">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-surface-container border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
            />
          </div>

          {mode === 'login' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-on-surface-variant">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-2xl px-4 py-3 pe-11 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 bg-transparent text-on-surface-variant"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setStatus(null);
                }}
                className="bg-transparent text-xs font-semibold text-primary pt-1"
              >
                نسيت كلمة المرور؟
              </button>
            </div>
          )}

          {status && (
            <div className={`text-sm rounded-xl px-4 py-3 ${status.type === 'error' ? 'text-error bg-error/5' : 'text-primary bg-primary/5'}`}>
              {status.message}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-on-primary font-bold py-3 rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {mode === 'login' ? 'دخول' : 'إرسال رابط إعادة التعيين'}
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setStatus(null);
              }}
              className="w-full bg-transparent text-sm font-semibold text-on-surface-variant"
            >
              الرجوع لتسجيل الدخول
            </button>
          )}
        </form>

        <p className="text-xs text-center text-on-surface-variant">
          حساب النشاط التجاري يُنشأ من قِبل فريق ريكو — تواصل معهم إذا لم تستلم دعوة.
        </p>
      </div>
    </div>
  );
}
