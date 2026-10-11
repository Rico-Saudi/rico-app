import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CATEGORY_LABELS, CLAIM_STATUS_LABELS, DEAL_STATUS_LABELS, DEAL_TYPE_LABELS } from './api';

// Brand green (single-series magnitude) + the dataviz reference palette's
// slot-1 blue (second categorical series, supply vs demand) — validated
// together via scripts/validate_palette.js before use here.
const COLOR_PRIMARY = '#0F9D58';
const COLOR_SECONDARY = '#2a78d6';
const GRID_STROKE = '#e1e0d9';
const AXIS_STROKE = '#898781';

const DAY_OPTIONS = [7, 30, 90];

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

export default function AnalyticsPanel({ authedFetch }) {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [trend, setTrend] = useState(null);
  const [categoryBreakdown, setCategoryBreakdown] = useState(null);
  const [topVendors, setTopVendors] = useState(null);
  const [expiringDeals, setExpiringDeals] = useState(null);
  const [dealTypePerf, setDealTypePerf] = useState(null);
  const [searchGaps, setSearchGaps] = useState(null);
  const [catalogGaps, setCatalogGaps] = useState(null);
  const [claimFunnel, setClaimFunnel] = useState(null);
  const [vendorActivity, setVendorActivity] = useState(null);

  const loadAll = useCallback(async () => {
    const [
      overviewRes,
      snapshotRes,
      trendRes,
      categoryRes,
      topVendorsRes,
      expiringRes,
      dealTypeRes,
      gapsRes,
      catalogGapsRes,
      funnelRes,
      activityRes,
    ] = await Promise.all([
      authedFetch('/owner/analytics/overview'),
      authedFetch(`/owner/analytics/snapshot-summary?days=${days}`),
      authedFetch(`/owner/analytics/impressions-trend?days=${days}`),
      authedFetch(`/owner/analytics/category-breakdown?days=${days}`),
      authedFetch(`/owner/analytics/top-vendors?days=${days}&limit=10`),
      authedFetch('/owner/analytics/expiring-deals?days=7'),
      authedFetch(`/owner/analytics/deal-type-performance?days=${days}`),
      authedFetch(`/owner/analytics/search-gaps?days=${days}`),
      authedFetch(`/owner/analytics/catalog-gaps?days=${days}`),
      authedFetch('/owner/analytics/claim-funnel'),
      authedFetch('/owner/analytics/vendor-activity'),
    ]);

    if (overviewRes) setOverview(await overviewRes.json());
    if (snapshotRes) setSnapshot((await snapshotRes.json()).summary);
    if (trendRes) setTrend((await trendRes.json()).series);
    if (categoryRes) setCategoryBreakdown((await categoryRes.json()).items);
    if (topVendorsRes) setTopVendors((await topVendorsRes.json()).items);
    if (expiringRes) setExpiringDeals((await expiringRes.json()).items);
    if (dealTypeRes) setDealTypePerf((await dealTypeRes.json()).items);
    if (gapsRes) setSearchGaps((await gapsRes.json()).items);
    if (catalogGapsRes) setCatalogGaps((await catalogGapsRes.json()).items);
    if (funnelRes) setClaimFunnel(await funnelRes.json());
    if (activityRes) setVendorActivity((await activityRes.json()).items);
  }, [authedFetch, days]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!overview) return <div className="owner-wide-card"><p className="note">جاري التحميل...</p></div>;

  return (
    <div>
      <div className="owner-toolbar">
        <h1 style={{ margin: 0 }}>التحليلات</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              className={days === d ? '' : 'secondary'}
              onClick={() => setDays(d)}
              type="button"
              style={{ padding: '8px 14px' }}
            >
              {d} يوم
            </button>
          ))}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{overview.businesses.total}</div>
          <div className="stat-label">إجمالي الأنشطة التجارية</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.businesses.active}</div>
          <div className="stat-label">أنشطة فعّالة</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.vendors.total}</div>
          <div className="stat-label">حسابات أصحاب الأنشطة</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.products.active}</div>
          <div className="stat-label">منتجات نشطة</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.discounts.active}</div>
          <div className="stat-label">خصومات نشطة</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{overview.usage.googlePlaces.count}/{overview.usage.googlePlaces.cap}</div>
          <div className="stat-label">استخدام Google Places ({overview.usage.googlePlaces.period})</div>
        </div>
      </div>

      {snapshot && (
        <div className="owner-wide-card" style={{ background: '#EAFBF0', border: '1px solid #0F9D58' }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>{snapshot}</p>
        </div>
      )}

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>اتجاه الظهور (آخر {days} يوم)</h1>
        {trend === null && <p className="note">جاري التحميل...</p>}
        {trend && trend.every((s) => s.count === 0) && <p className="note">لا توجد ظهورات مسجّلة بعد خلال هذه الفترة.</p>}
        {trend && trend.some((s) => s.count > 0) && (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_PRIMARY} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={COLOR_PRIMARY} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} stroke={AXIS_STROKE} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={AXIS_STROKE} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
              <Tooltip labelFormatter={formatShortDate} formatter={(v) => [v, 'ظهور']} />
              <Area type="monotone" dataKey="count" stroke={COLOR_PRIMARY} strokeWidth={2} fill="url(#trendFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>العرض والطلب حسب الفئة (آخر {days} يوم)</h1>
        <p className="subtitle">مرات الظهور (طلب) مقابل عدد الأنشطة الفعّالة (عرض) لكل فئة.</p>
        {categoryBreakdown === null && <p className="note">جاري التحميل...</p>}
        {categoryBreakdown && categoryBreakdown.length > 0 && (
          <ResponsiveContainer width="100%" height={Math.max(220, categoryBreakdown.length * 40)}>
            <BarChart
              data={categoryBreakdown.map((r) => ({ ...r, label: CATEGORY_LABELS[r.categorySlug] || r.categorySlug }))}
              layout="vertical"
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" stroke={AXIS_STROKE} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" stroke={AXIS_STROKE} fontSize={12} tickLine={false} axisLine={false} width={90} />
              <Tooltip />
              <Legend formatter={(v) => (v === 'impressions' ? 'مرات الظهور' : 'عدد الأنشطة')} />
              <Bar dataKey="impressions" name="impressions" fill={COLOR_PRIMARY} radius={[0, 4, 4, 0]} barSize={12} />
              <Bar dataKey="businessCount" name="businessCount" fill={COLOR_SECONDARY} radius={[0, 4, 4, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>الأكثر ظهوراً (آخر {days} يوم)</h1>
        {topVendors === null && <p className="note">جاري التحميل...</p>}
        {topVendors && topVendors.length === 0 && <p className="note">لا توجد بيانات ظهور بعد.</p>}
        {topVendors && topVendors.length > 0 && (
          <table>
            <thead><tr><th>#</th><th>النشاط</th><th>الفئة</th><th>مرات الظهور</th></tr></thead>
            <tbody>
              {topVendors.map((v, i) => (
                <tr key={v.businessId}>
                  <td>{i + 1}</td>
                  <td>{v.name}</td>
                  <td>{CATEGORY_LABELS[v.categorySlug] || v.categorySlug || '—'}</td>
                  <td>{v.impressions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>عروض تنتهي قريباً (خلال 7 أيام)</h1>
        {expiringDeals === null && <p className="note">جاري التحميل...</p>}
        {expiringDeals && expiringDeals.length === 0 && <p className="note">لا توجد عروض ستنتهي قريباً.</p>}
        {expiringDeals && expiringDeals.length > 0 && (
          <table>
            <thead><tr><th>النشاط</th><th>العرض</th><th>ينتهي في</th></tr></thead>
            <tbody>
              {expiringDeals.map((d) => (
                <tr key={d.dealId}>
                  <td>{d.businessName || '—'}</td>
                  <td>{d.titleAr}</td>
                  <td>{new Date(d.endsAt).toLocaleDateString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>أداء أنواع العروض حسب الظهور (آخر {days} يوم)</h1>
        {dealTypePerf === null && <p className="note">جاري التحميل...</p>}
        {dealTypePerf && dealTypePerf.length === 0 && <p className="note">لا توجد ظهورات مرتبطة بعروض محددة بعد.</p>}
        {dealTypePerf && dealTypePerf.length > 0 && (
          <ResponsiveContainer width="100%" height={Math.max(160, dealTypePerf.length * 40)}>
            <BarChart
              data={dealTypePerf.map((r) => ({ ...r, label: DEAL_TYPE_LABELS[r.dealType] || r.dealType }))}
              layout="vertical"
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" stroke={AXIS_STROKE} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" stroke={AXIS_STROKE} fontSize={12} tickLine={false} axisLine={false} width={140} />
              <Tooltip formatter={(v) => [v, 'مرات الظهور']} />
              <Bar dataKey="count" fill={COLOR_PRIMARY} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>فجوات الطلب (بحث بلا نتائج، آخر {days} يوم)</h1>
        <p className="subtitle">فئات طلبها المستخدمون ولم نجد نشاطاً تجارياً قريباً — مرشّحة للاستقطاب.</p>
        {searchGaps === null && <p className="note">جاري التحميل...</p>}
        {searchGaps && searchGaps.length === 0 && <p className="note">لا توجد فجوات طلب مسجّلة بعد.</p>}
        {searchGaps && searchGaps.length > 0 && (
          <table>
            <thead><tr><th>الفئة</th><th>عدد مرات البحث بلا نتائج</th></tr></thead>
            <tbody>
              {searchGaps.map((g) => (
                <tr key={g.categorySlug}>
                  <td>{CATEGORY_LABELS[g.categorySlug] || g.categorySlug}</td>
                  <td>{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>أصناف مطلوبة وغير موجودة بالقوائم (آخر {days} يوم)</h1>
        <p className="subtitle">
          أصناف طلبها العملاء من محل بعينه وما هي بقائمته. «أقرب صنف عنده» يفرّق بين صنف ناقص فعلاً
          وبين صنف موجود باسم ثاني يحتاج تعديل تسمية.
        </p>
        {catalogGaps === null && <p className="note">جاري التحميل...</p>}
        {catalogGaps && catalogGaps.length === 0 && <p className="note">ما فيه أصناف مطلوبة غير موجودة بعد.</p>}
        {catalogGaps && catalogGaps.length > 0 && (
          <table>
            <thead>
              <tr><th>المحل</th><th>الصنف المطلوب</th><th>عدد الطلبات</th><th>أقرب صنف عنده</th></tr>
            </thead>
            <tbody>
              {catalogGaps.map((g) => (
                <tr key={`${g.businessId}-${g.requestedItem}`}>
                  <td>{g.businessName || g.businessId}</td>
                  <td>{g.requestedItem}</td>
                  <td>{g.count}</td>
                  <td>
                    {g.nearestLabel ? (
                      <>
                        {g.nearestLabel} <small className="note">({Math.round((g.nearestScore || 0) * 100)}%)</small>
                      </>
                    ) : (
                      <span className="note">ولا شي قريب</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {claimFunnel && (
        <div className="owner-wide-card">
          <h1 style={{ fontSize: 17 }}>قمع مراجعة طلبات الربط</h1>
          <p className="subtitle">
            {claimFunnel.avgDecisionHours != null
              ? `متوسط وقت اتخاذ القرار: ${claimFunnel.avgDecisionHours} ساعة`
              : 'لا توجد بيانات كافية لحساب متوسط وقت القرار بعد.'}
          </p>
          <table>
            <thead><tr><th>الحالة</th><th>العدد</th></tr></thead>
            <tbody>
              {Object.entries(claimFunnel.byStatus).map(([status, count]) => (
                <tr key={status}>
                  <td>{CLAIM_STATUS_LABELS[status] || status}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vendorActivity && (
        <div className="owner-wide-card">
          <h1 style={{ fontSize: 17 }}>نشاط أصحاب الأنشطة</h1>
          <p className="subtitle">مؤشر تفاعل (آخر دخول، عدد الأنشطة والعروض المُدارة) — لا يوجد نظام دفعات لقياس الإيرادات بعد.</p>
          {vendorActivity.length === 0 && <p className="note">لا يوجد حسابات أصحاب أنشطة بعد.</p>}
          {vendorActivity.length > 0 && (
            <table>
              <thead><tr><th>البريد الإلكتروني</th><th>آخر دخول</th><th>أنشطة فعّالة</th><th>عروض نشطة</th></tr></thead>
              <tbody>
                {vendorActivity.map((v) => (
                  <tr key={v.vendorId}>
                    <td>{v.email}</td>
                    <td>{v.lastLoginAt ? new Date(v.lastLoginAt).toLocaleDateString('ar-SA') : '—'}</td>
                    <td>{v.activeBusinesses}</td>
                    <td>{v.activeDeals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
