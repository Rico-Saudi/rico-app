import { useEffect, useState } from 'react';
import { Package, Tag, Store, Clock } from 'lucide-react';

const STAT_ICONS = { products: Package, deals: Tag, businesses: Store, pending: Clock };

function StatTile({ icon: Icon, value, label }) {
  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm flex items-center gap-4">
      <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-extrabold">{value}</p>
        <p className="text-xs text-on-surface-variant font-semibold">{label}</p>
      </div>
    </div>
  );
}

export default function OverviewTab({ authedFetch, me, activeClaims }) {
  const [productCount, setProductCount] = useState(null);
  const [activeDealCount, setActiveDealCount] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClaims.length]);

  async function load() {
    const [dealsRes, ...productResults] = await Promise.all([
      authedFetch('/vendor/deals'),
      ...activeClaims.map((c) => authedFetch(`/vendor/products?businessId=${c.placeId}`)),
    ]);

    if (dealsRes) {
      const dealsData = await dealsRes.json();
      setActiveDealCount(dealsData.deals.filter((d) => d.status === 'active').length);
    }

    let total = 0;
    for (const res of productResults) {
      if (!res) continue;
      const data = await res.json();
      total += data.total ?? 0;
    }
    setProductCount(total);
  }

  const pendingClaims = me.claims.filter((c) => c.status === 'pending_review').length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">نظرة عامة</h1>
        <p className="text-on-surface-variant mt-1">مرحباً بك، {me.email}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile icon={STAT_ICONS.businesses} value={activeClaims.length} label="أنشطة مُفعّلة" />
        <StatTile icon={STAT_ICONS.products} value={productCount ?? '—'} label="منتج" />
        <StatTile icon={STAT_ICONS.deals} value={activeDealCount ?? '—'} label="عرض نشط" />
        <StatTile icon={STAT_ICONS.pending} value={pendingClaims} label="طلب قيد المراجعة" />
      </div>
    </div>
  );
}
