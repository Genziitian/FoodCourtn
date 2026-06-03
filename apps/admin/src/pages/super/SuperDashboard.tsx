import { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, Building2, ChartBar, ChevronRight, CreditCard,
  ShoppingBag, TrendingUp, Wifi,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../../components/PageHeader';
import { SimpleBarChart } from '../../components/Charts';
import {
  getPlatformMetrics, getRevenueByOrg, listOrganizations, type PlatformMetrics, type OrgRow,
} from '../../lib/api';

export default function SuperDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [orgRevenue, setOrgRevenue] = useState<Array<{ org_id: string; org_name: string; brand_color: string; revenue_today: number; orders_today: number }>>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, r, o] = await Promise.all([getPlatformMetrics(), getRevenueByOrg(), listOrganizations()]);
        if (cancelled) return;
        setMetrics(m); setOrgRevenue(r); setOrgs(o);
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const orgRevenueBars = orgRevenue.slice(0, 6).map(o => ({
    label: o.org_name.split(' ')[0],
    value: o.revenue_today,
    highlight: o.revenue_today > 0,
  }));

  const topOrg = orgRevenue[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        subtitle="Across all organizations, branches, and gateways."
      />

      {loading && <p className="text-sm text-slate-500">Loading platform metrics…</p>}

      {metrics && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Building2}  iconBg="bg-purple-50 text-purple-700"   label="Organizations"   value={String(metrics.total_orgs)}      sub={`${metrics.new_signups_week} new this week`} />
            <StatCard icon={Building2}  iconBg="bg-blue-50 text-blue-700"       label="Active branches" value={`${metrics.active_branches} / ${metrics.total_branches}`} sub="Across the platform" />
            <StatCard icon={ShoppingBag} iconBg="bg-emerald-50 text-emerald-700" label="Orders today"    value={metrics.total_orders_today.toLocaleString('en-IN')} sub={`AOV ${inr(metrics.avg_order_value)}`} />
            <StatCard icon={TrendingUp} iconBg="bg-amber-50 text-amber-700"     label="GMV today"       value={inr(metrics.total_revenue_today)} sub={`${inr(metrics.total_commission_today)} platform fee`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AlertCard
              color="rose"
              icon={AlertTriangle}
              label="Failed payments today"
              value={String(metrics.failed_payments_today)}
              sub="Across all branches"
              onClick={() => navigate('/super/payments')}
            />
            <AlertCard
              color="emerald"
              icon={Wifi}
              label="Platform uptime"
              value={`${metrics.uptime_pct}%`}
              sub="Last 30 days"
              onClick={() => navigate('/super/health')}
            />
            <AlertCard
              color="purple"
              icon={ChartBar}
              label="Top org by GMV"
              value={topOrg?.org_name ?? '—'}
              sub={topOrg ? `${inr(topOrg.revenue_today)} today` : 'No revenue yet'}
              onClick={() => navigate('/super/restaurants')}
            />
          </div>

          <section className="bg-white rounded-2xl shadow-card p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-bold">Revenue by organization</h2>
                <p className="text-sm text-slate-500">Today, all branches combined</p>
              </div>
              <button onClick={() => navigate('/super/restaurants')} className="text-sm font-semibold text-brand-600 inline-flex items-center gap-1">
                View all <ChevronRight className="size-4" />
              </button>
            </div>
            {orgRevenueBars.length ? (
              <SimpleBarChart data={orgRevenueBars} formatValue={n => inr(n)} height={160} />
            ) : (
              <p className="text-sm text-slate-500 py-12 text-center">No revenue yet today</p>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white rounded-2xl shadow-card overflow-hidden">
              <header className="px-6 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">Newest organizations</h2>
                <button onClick={() => navigate('/super/restaurants')} className="text-sm font-semibold text-brand-600 inline-flex items-center gap-1">
                  All <ChevronRight className="size-4" />
                </button>
              </header>
              <ul className="divide-y divide-slate-100">
                {[...orgs]
                  .sort((a, b) => +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0))
                  .slice(0, 8)
                  .map(o => (
                    <li key={o.id} className="px-6 py-3 flex items-center gap-3">
                      <span
                        className="size-9 grid place-items-center rounded-full text-white text-xs font-bold shrink-0"
                        style={{ background: o.brand_color }}
                      >
                        {o.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{o.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{o.plan}</p>
                      </div>
                      {o.created_at && (
                        <span className="text-xs text-slate-500">
                          {Math.floor((Date.now() - +new Date(o.created_at)) / 86400e3)}d ago
                        </span>
                      )}
                    </li>
                  ))}
                {orgs.length === 0 && (
                  <li className="px-6 py-8 text-sm text-center text-slate-500">No organizations yet.</li>
                )}
              </ul>
            </section>

            <section className="bg-white rounded-2xl shadow-card overflow-hidden">
              <header className="px-6 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-base font-bold">Revenue ranking</h2>
              </header>
              <ul className="divide-y divide-slate-100">
                {orgRevenue.slice(0, 6).map(o => (
                  <li key={o.org_id} className="px-6 py-3 flex items-center gap-3">
                    <span className="size-9 grid place-items-center rounded-lg bg-blue-50 text-blue-700 shrink-0">
                      <CreditCard className="size-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{o.org_name}</p>
                      <p className="text-xs text-slate-500">{o.orders_today} orders today</p>
                    </div>
                    <span className="font-bold">{inr(o.revenue_today)}</span>
                  </li>
                ))}
                {orgRevenue.length === 0 && (
                  <li className="px-6 py-8 text-sm text-center text-slate-500">No orders yet today.</li>
                )}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon, iconBg, label, value, sub,
}: { icon: any; iconBg: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-card flex items-start gap-3">
      <span className={cls('size-10 grid place-items-center rounded-lg', iconBg)}>
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-extrabold mt-1.5">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function AlertCard({ color, icon: Icon, label, value, sub, onClick }: { color: 'rose'|'emerald'|'purple'; icon: any; label: string; value: string; sub: string; onClick: () => void }) {
  const map = {
    rose:    { bg: 'bg-rose-50 text-rose-700',       dot: 'text-rose-600' },
    emerald: { bg: 'bg-emerald-50 text-emerald-700', dot: 'text-emerald-600' },
    purple:  { bg: 'bg-purple-50 text-purple-700',   dot: 'text-purple-600' },
  }[color];
  return (
    <button onClick={onClick} className="text-left bg-white p-5 rounded-2xl shadow-card w-full hover:shadow-cardHover transition">
      <div className="flex items-start gap-3">
        <span className={cls('size-10 grid place-items-center rounded-lg', map.bg)}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-2xl font-extrabold mt-1.5">{value}</p>
          <p className={cls('text-xs mt-1 inline-flex items-center gap-1', map.dot)}>
            <ArrowUpRight className="size-3.5" />
            {sub}
          </p>
        </div>
      </div>
    </button>
  );
}
