import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LayoutDashboard, Package, Tag, Percent, Inbox, Settings as SettingsIcon, LogOut, Store } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createAuthedFetch } from './vendor/api';
import OverviewTab from './vendor/OverviewTab';
import ProductsTab from './vendor/ProductsTab';
import DealsTab from './vendor/DealsTab';
import DiscountsTab from './vendor/DiscountsTab';
import RequestsTab from './vendor/RequestsTab';
import SettingsTab from './vendor/SettingsTab';
import { profileFor } from './vendor/verticals';
import OrdersPauseControl from './vendor/OrdersPauseControl';

const BASE_TITLE = 'لوحة النشاط — ريكو';

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
  const [prefillName, setPrefillName] = useState(null);
  const [waiting, setWaiting] = useState(0);

  // Stable across renders, so tabs that load in an effect keyed on it don't
  // refetch every time the shell re-renders.
  const authedFetch = useMemo(() => createAuthedFetch(() => setMe(false)), []);

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
    // Keeps the business the vendor picked when /me is reloaded (after a
    // settings save, say) unless that business is no longer active.
    const active = data.claims.filter((c) => c.status === 'active').map((c) => String(c.placeId));
    setActiveBusinessId((current) => (current && active.includes(current) ? current : active[0] ?? null));
  }

  // Orders waiting on the shop, for the badge on the requests tab. Polled
  // because they arrive from the chat while the dashboard sits open.
  useEffect(() => {
    if (!me) return undefined;
    let stopped = false;
    async function poll() {
      const res = await authedFetch('/vendor/stats?days=1');
      if (!res || !res.ok || stopped) return;
      const data = await res.json();
      setWaiting(data.requests?.waiting ?? 0);
    }
    poll();
    const t = setInterval(poll, 60_000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [me, authedFetch, tab]);

  // A dashboard left open in a background tab still has to get noticed: the
  // count goes in the tab title, and a rise in it raises a browser
  // notification if the vendor allowed them (Settings → تنبيهات المتصفح).
  const lastWaiting = useRef(null);
  useEffect(() => {
    document.title = waiting > 0 ? `(${waiting}) ${BASE_TITLE}` : BASE_TITLE;
    const previous = lastWaiting.current;
    lastWaiting.current = waiting;
    if (previous === null || waiting <= previous) return;
    try {
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        const n = new Notification('طلب جديد في ريكو', {
          body: waiting === 1 ? 'عندك طلب ينتظر ردك.' : `عندك ${waiting} طلبات تنتظر ردك.`,
          tag: 'rico-new-order',
        });
        n.onclick = () => {
          window.focus();
          changeTab('requests');
          n.close();
        };
      }
    } catch {
      // Some browsers expose Notification but throw when constructing it
      // outside a service worker; the title count still does the job.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  useEffect(() => () => {
    document.title = BASE_TITLE;
  }, []);

  // Stable, so children that re-read /me after a change (the pause switch's
  // auto-reopen timer) don't reset on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reloadMe = useCallback(() => loadMe(), []);

  const changeTab = useCallback((next) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', next);
    const url = `${window.location.pathname}?${params}`;
    window.history.pushState({ tab: next }, '', url);
  }, []);

  // The overview's "customers asked for X" list opens the add form with X
  // already typed, on the business it was asked of.
  const addItemFromOverview = useCallback(
    (name, businessId) => {
      if (businessId) setActiveBusinessId(String(businessId));
      setPrefillName(name);
      changeTab('products');
    },
    [changeTab],
  );

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
  const activeClaim = activeClaims.find((c) => String(c.placeId) === String(activeBusinessId)) || activeClaims[0];
  const profile = profileFor(activeClaim?.vertical);
  const tabLabel = (t) => (t.id === 'products' ? profile.itemsLabel : t.label);

  return (
    <div className="min-h-screen flex bg-surface text-on-surface" dir="rtl">
      <aside className="hidden lg:flex h-screen w-64 fixed right-0 top-0 flex-col py-8 bg-surface-container-lowest border-l border-outline-variant z-20">
        <div className="px-6 mb-8 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-lg text-primary block">لوحة النشاط</span>
            {activeClaim && <span className="text-xs text-on-surface-variant truncate block">{activeClaim.placeName}</span>}
          </div>
        </div>

        {activeClaim && (
          <div className="px-4 mb-4">
            <OrdersPauseControl authedFetch={authedFetch} claim={activeClaim} onChanged={reloadMe} />
          </div>
        )}

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
                <span className="flex-1 text-start">{tabLabel(t)}</span>
                {t.id === 'requests' && waiting > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-error text-white text-[11px] font-bold flex items-center justify-center">
                    {waiting}
                  </span>
                )}
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

      <main className="flex-1 lg:ms-64 min-h-screen min-w-0">
        {/* Below lg the sidebar gives way to a scrollable tab strip — shop
            owners check orders from their phone far more than from a desk. */}
        <div className="lg:hidden sticky top-0 z-20 bg-surface-container-lowest border-b border-outline-variant">
          <div className="flex items-center gap-2 px-4 pt-3">
            <span className="font-bold text-primary truncate">{activeClaim?.placeName || 'لوحة النشاط'}</span>
            <div className="flex-1" />
            {activeClaim && <OrdersPauseControl authedFetch={authedFetch} claim={activeClaim} onChanged={reloadMe} compact />}
            <button onClick={logout} aria-label="تسجيل الخروج" className="p-2 bg-transparent text-error">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 py-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${
                  tab === t.id ? 'bg-primary/10 text-primary' : 'bg-transparent text-on-surface-variant'
                }`}
              >
                {tabLabel(t)}
                {t.id === 'requests' && waiting > 0 && (
                  <span className="min-w-4 h-4 px-1 rounded-full bg-error text-white text-[10px] flex items-center justify-center">{waiting}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {tab === 'overview' && (
                <OverviewTab
                  authedFetch={authedFetch}
                  me={me}
                  activeClaims={activeClaims}
                  profile={profile}
                  onNavigate={changeTab}
                  onAddItem={addItemFromOverview}
                />
              )}
              {tab === 'products' && (
                <ProductsTab
                  authedFetch={authedFetch}
                  activeClaims={activeClaims}
                  activeBusinessId={activeBusinessId}
                  onChangeBusiness={setActiveBusinessId}
                  profile={profile}
                  prefillName={prefillName}
                  onPrefillConsumed={() => setPrefillName(null)}
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
              {tab === 'requests' && <RequestsTab authedFetch={authedFetch} activeClaims={activeClaims} />}
              {tab === 'settings' && <SettingsTab authedFetch={authedFetch} me={me} onClaimed={reloadMe} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
