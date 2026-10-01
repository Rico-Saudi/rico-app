import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Package, Tag, Percent, Inbox, Settings as SettingsIcon, LogOut, Store } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createAuthedFetch } from './vendor/api';
import OverviewTab from './vendor/OverviewTab';
import ProductsTab from './vendor/ProductsTab';
import DealsTab from './vendor/DealsTab';
import DiscountsTab from './vendor/DiscountsTab';
import RequestsTab from './vendor/RequestsTab';
import SettingsTab from './vendor/SettingsTab';

const TABS = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'products', label: 'المنتجات', icon: Package },
  { id: 'discounts', label: 'الخصومات', icon: Percent },
  { id: 'deals', label: 'العروض', icon: Tag },
  { id: 'requests', label: 'الطلبات', icon: Inbox },
  { id: 'settings', label: 'الإعدادات', icon: SettingsIcon },
];

function parseTab(search) {
  const tab = new URLSearchParams(search).get('tab');
  return TABS.some((t) => t.id === tab) ? tab : 'overview';
}

export default function VendorDashboard() {
  const [me, setMe] = useState(null); // null = loading, false = unauthenticated
  const [tab, setTab] = useState(() => parseTab(window.location.search));
  const [activeBusinessId, setActiveBusinessId] = useState(null);

  function handleUnauthorized() {
    setMe(false);
  }
  const authedFetch = createAuthedFetch(handleUnauthorized);

  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.history.replaceState({ tab }, '', window.location.href);
    const onPopState = (e) => setTab(e.state?.tab ?? parseTab(window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMe() {
    const res = await fetch('/vendor/me');
    if (res.status === 401) return setMe(false);
    const data = await res.json();
    setMe(data);
    const firstActive = data.claims.find((c) => c.status === 'active');
    if (firstActive) setActiveBusinessId(String(firstActive.placeId));
  }

  const changeTab = useCallback((next) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', next);
    const url = `${window.location.pathname}?${params}`;
    window.history.pushState({ tab: next }, '', url);
  }, []);

  async function logout() {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = '/vendor/login';
  }

  if (me === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant">
        جاري التحميل...
      </div>
    );
  }

  if (me === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="bg-surface-container-lowest rounded-3xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
          <h1 className="text-xl font-bold text-primary">يجب تسجيل الدخول</h1>
          <p className="text-sm text-on-surface-variant">انتهت الجلسة أو لم تسجّل الدخول بعد.</p>
          <a href="/vendor/login">
            <button className="w-full bg-primary text-on-primary font-bold py-3 rounded-xl hover:opacity-90 transition-opacity">
              تسجيل الدخول
            </button>
          </a>
        </div>
      </div>
    );
  }

  const activeClaims = me.claims.filter((c) => c.status === 'active');

  return (
    <div className="min-h-screen flex bg-surface text-on-surface" dir="rtl">
      <aside className="h-screen w-64 fixed right-0 top-0 flex flex-col py-8 bg-surface-container-lowest border-l border-outline-variant z-20">
        <div className="px-6 mb-8 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Store className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg text-primary">لوحة النشاط</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  active ? 'bg-primary/10 text-primary' : 'bg-transparent text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="px-4 pt-4 border-t border-outline-variant space-y-2">
          <p className="px-4 text-xs text-on-surface-variant truncate">{me.email}</p>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-transparent text-error hover:bg-error/5 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex-1 ms-64 min-h-screen">
        <div className="max-w-5xl mx-auto px-8 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'overview' && (
                <OverviewTab authedFetch={authedFetch} me={me} activeClaims={activeClaims} />
              )}
              {tab === 'products' && (
                <ProductsTab
                  authedFetch={authedFetch}
                  activeClaims={activeClaims}
                  activeBusinessId={activeBusinessId}
                  onChangeBusiness={setActiveBusinessId}
                />
              )}
              {tab === 'discounts' && (
                <DiscountsTab
                  authedFetch={authedFetch}
                  activeClaims={activeClaims}
                  activeBusinessId={activeBusinessId}
                  onChangeBusiness={setActiveBusinessId}
                />
              )}
              {tab === 'deals' && (
                <DealsTab
                  authedFetch={authedFetch}
                  activeClaims={activeClaims}
                  activeBusinessId={activeBusinessId}
                  onChangeBusiness={setActiveBusinessId}
                />
              )}
              {tab === 'requests' && <RequestsTab authedFetch={authedFetch} />}
              {tab === 'settings' && <SettingsTab authedFetch={authedFetch} me={me} onClaimed={loadMe} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
