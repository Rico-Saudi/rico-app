import { useEffect, useState } from 'react';
import { Eye, Inbox, Wallet, Clock, Package, ImageOff, PackageX, FolderX, Plus, CheckCircle2, Search } from 'lucide-react';
import ImpressionsChart from '../owner/ImpressionsChart';
import { REQUEST_STAGES } from './api';

const RANGES = [7, 30, 90];

function StatTile({ icon: Icon, value, label, hint, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`bg-surface-container-lowest rounded-3xl p-5 shadow-sm flex items-center gap-4 text-start ${
        onClick ? 'hover:ring-2 hover:ring-primary/20 transition' : ''
      }`}
    >
      <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold">{value}</p>
        <p className="text-xs text-on-surface-variant font-semibold">{label}</p>
        {hint && <p className="text-[11px] text-on-surface-variant mt-0.5">{hint}</p>}
      </div>
    </Tag>
  );
}

function Card({ title, subtitle, children, action }) {
  return (
    <section className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const fmt = (n) => Number(n || 0).toLocaleString('ar-SA');

export default function OverviewTab({ authedFetch, me, activeClaims, profile, onNavigate, onAddItem }) {
  const [scope, setScope] = useState(''); // '' = all businesses
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (activeClaims.length === 0) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, days, activeClaims.length]);

  async function load() {
    setFailed(false);
    const params = new URLSearchParams({ days: String(days) });
    if (scope) params.set('businessId', scope);
    const res = await authedFetch(`/vendor/stats?${params}`);
    if (!res) return;
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setStats(await res.json());
  }

  const pendingClaims = me.claims.filter((c) => c.status === 'pending_review').length;

  if (activeClaims.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-extrabold">نظرة عامة</h1>
        <div className="bg-surface-container-lowest rounded-3xl p-8 text-center space-y-3">
          <p className="text-on-surface-variant">
            {pendingClaims > 0
              ? `عندك ${pendingClaims} طلب ربط قيد المراجعة. بنفعّل لوحتك أول ما يتم اعتماده.`
              : 'ما في نشاط مربوط بحسابك بعد. اربط محلك من الإعدادات.'}
          </p>
          <button onClick={() => onNavigate('settings')} className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold">
            الإعدادات
          </button>
        </div>
      </div>
    );
  }

  const catalog = stats?.catalog;
  const conversion = stats && stats.impressions.total > 0 ? Math.round((stats.requests.total / stats.impressions.total) * 1000) / 10 : null;
  const maxTop = Math.max(1, ...(stats?.topItems || []).map((i) => i.quantity));

  // Ordered by how much each one costs the shop: a customer can't order what
  // isn't listed, a sold-out item can't be ordered, and a photo or category
  // only helps it be found.
  const checklist = catalog
    ? [
        {
          done: catalog.total > 0,
          icon: Package,
          text: catalog.total > 0 ? `${fmt(catalog.total)} ${profile.itemSingular} معروض للعملاء` : `ما أضفت أي ${profile.itemSingular} بعد`,
        },
        {
          done: catalog.outOfStock === 0,
          icon: PackageX,
          text: catalog.outOfStock === 0 ? 'كل شي متوفر' : `${fmt(catalog.outOfStock)} نافد — ما يظهر للعملاء`,
        },
        {
          done: catalog.withoutImage === 0,
          icon: ImageOff,
          text: catalog.withoutImage === 0 ? 'كلها فيها صور' : `${fmt(catalog.withoutImage)} بدون صورة`,
        },
        {
          done: catalog.withoutCategory === 0,
          icon: FolderX,
          text: catalog.withoutCategory === 0 ? 'كلها مصنّفة' : `${fmt(catalog.withoutCategory)} بدون فئة`,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">نظرة عامة</h1>
          <p className="text-on-surface-variant mt-1">أداء {activeClaims.length > 1 && !scope ? 'أنشطتك' : 'نشاطك'} على ريكو</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeClaims.length > 1 && (
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="bg-surface-container-high border-none rounded-xl py-2 px-4 text-sm font-semibold outline-none"
            >
              <option value="">كل الأنشطة</option>
              {activeClaims.map((c) => (
                <option key={c.placeId} value={c.placeId}>
                  {c.placeName}
                </option>
              ))}
            </select>
          )}
          <div className="flex bg-surface-container rounded-xl p-1 text-xs font-bold">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg ${
                  days === d ? 'bg-surface-container-lowest shadow-sm text-on-surface' : 'bg-transparent text-on-surface-variant'
                }`}
              >
                {d} يوم
              </button>
            ))}
          </div>
        </div>
      </div>

      {failed && <p className="text-sm text-error bg-error/5 rounded-xl px-4 py-3">تعذر تحميل الإحصائيات.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Eye} value={stats ? fmt(stats.impressions.total) : '—'} label="مرة ظهرت للعملاء" />
        <StatTile
          icon={Inbox}
          value={stats ? fmt(stats.requests.total) : '—'}
          label="طلب"
          hint={conversion !== null ? `${conversion}٪ من مرات الظهور` : null}
          onClick={() => onNavigate('requests')}
        />
        <StatTile
          icon={Wallet}
          value={stats ? `${fmt(stats.requests.completedValue)} ر.س` : '—'}
          label="مبيعات مكتملة"
          hint="مجموع الطلبات المكتملة"
        />
        <StatTile
          icon={Clock}
          value={stats ? fmt(stats.requests.waiting) : '—'}
          label="طلب ينتظر ردك"
          onClick={() => onNavigate('requests')}
        />
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="مرات الظهور يومياً" subtitle="كم مرة ظهر محلك أو عروضك في محادثات ريكو">
              {stats.impressions.total > 0 ? (
                <ImpressionsChart series={stats.impressions.daily} />
              ) : (
                <p className="text-sm text-on-surface-variant py-8 text-center">ما ظهرت بعد في هالفترة.</p>
              )}
            </Card>
            <Card title="الطلبات يومياً">
              {stats.requests.total > 0 ? (
                <ImpressionsChart series={stats.requests.daily} />
              ) : (
                <p className="text-sm text-on-surface-variant py-8 text-center">ما وصلتك طلبات في هالفترة.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="حالة الطلبات">
              <div className="space-y-2">
                {REQUEST_STAGES.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${s.badge}`}>{s.label}</span>
                    <span className="font-bold tabular-nums">{fmt(stats.requests.byStage[s.id])}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="الأكثر طلباً" subtitle="بعدد القطع، بدون الطلبات الملغية">
              {stats.topItems.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4 text-center">ما في طلبات بعد.</p>
              ) : (
                <ol className="space-y-2.5">
                  {stats.topItems.map((item) => (
                    <li key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold truncate">{item.label}</span>
                        <span className="text-xs text-on-surface-variant shrink-0 tabular-nums">
                          {fmt(item.quantity)} قطعة · {fmt(item.orders)} طلب
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(item.quantity / maxTop) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              title="طلبها عملاؤك وما لقوها عندك"
              subtitle="أصناف سألوا عنها بالاسم في محادثة ريكو وما كانت بقائمتك"
            >
              {stats.gaps.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4 text-center flex items-center justify-center gap-2">
                  <Search className="w-4 h-4" /> ما في طلبات فائتة بهالفترة.
                </p>
              ) : (
                <ul className="divide-y divide-outline-variant">
                  {stats.gaps.map((g) => (
                    <li key={g.requestedItem} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{g.requestedItem}</p>
                        <p className="text-xs text-on-surface-variant">
                          {fmt(g.count)} مرة{g.nearestLabel ? ` · أقرب شي عندك: ${g.nearestLabel}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => onAddItem(g.requestedItem, scope)}
                        className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-primary/10 text-primary"
                      >
                        <Plus className="w-3.5 h-3.5" /> أضفه
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`جاهزية ${profile.itemsLabel}`} subtitle="كل نقطة هنا تزيد فرصة إنك تظهر وتنطلب">
              <ul className="space-y-2.5">
                {checklist.map((c) => {
                  const Icon = c.done ? CheckCircle2 : c.icon;
                  return (
                    <li key={c.text} className="flex items-center gap-3 text-sm">
                      <Icon className={`w-4 h-4 shrink-0 ${c.done ? 'text-primary' : 'text-amber-600'}`} />
                      <span className={c.done ? 'text-on-surface-variant' : 'font-semibold'}>{c.text}</span>
                    </li>
                  );
                })}
              </ul>
              <button onClick={() => onNavigate('products')} className="text-sm font-bold text-primary bg-transparent">
                إدارة {profile.itemsLabel} ←
              </button>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
