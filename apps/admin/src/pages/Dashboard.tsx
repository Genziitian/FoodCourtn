import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, ChefHat, ChevronRight, CreditCard,
  ShoppingBag, TrendingDown, TrendingUp, Utensils,
} from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { OrderStatusPill, TypePill } from '../components/StatusPill';
import { SimpleBarChart, Sparkline } from '../components/Charts';
import { useTenant } from '../lib/tenant';
import {
  type AdminOrder, getDashboardMetrics, listOrders, subscribeToOrders,
  type DashboardMetrics,
} from '../lib/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const { scopedRestaurantIds, branch, branches } = useTenant();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [liveOrders, setLiveOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!scopedRestaurantIds.length) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [m, live] = await Promise.all([
        getDashboardMetrics(scopedRestaurantIds),
        listOrders({ restaurantIds: scopedRestaurantIds, status: 'active', limit: 5 }),
      ]);
      setMetrics(m);
      setLiveOrders(live);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scopedRestaurantIds.join('|')]);

  useEffect(() => {
    if (!scopedRestaurantIds.length) return;
    const unsub = subscribeToOrders(scopedRestaurantIds, () => { refresh(); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRestaurantIds.join('|')]);

  const scopeLabel = branch ? branch.name : `All ${branches.length} branches`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Today&apos;s Performance</h1>
          <p className="text-sm text-slate-500 mt-1">
            {scopeLabel}
            {error && <span className="ml-2 text-rose-600">· {error}</span>}
          </p>
        </div>
        <p className="text-sm text-emerald-600 inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          Live · realtime
        </p>
      </div>

      {/* Loading skeleton */}
      {loading && !metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl shadow-card animate-pulse">
              <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
              <div className="h-8 w-32 bg-slate-200 rounded" />
              <div className="h-2 w-20 bg-slate-200 rounded mt-3" />
            </div>
          ))}
        </div>
      )}

      {/* Top row */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-card lg:col-span-2 relative overflow-hidden">
            <div className="flex items-start gap-4">
              <span className="size-12 grid place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <TrendingUp className="size-6" />
              </span>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue today</p>
                <p className="text-4xl font-extrabold mt-2">{inr(metrics.revenue_today)}</p>
                <p className="text-xs mt-3 inline-flex items-center gap-1 text-slate-500">
                  Across {scopedRestaurantIds.length} branch{scopedRestaurantIds.length === 1 ? '' : 'es'}
                </p>
              </div>
              <div className="absolute right-6 bottom-6 opacity-90">
                <Sparkline
                  values={metrics.hourly.slice(9).map(h => Math.max(1, h.sales))}
                  color="#10B981"
                  width={140} height={50}
                />
              </div>
            </div>
          </div>

          <MetricCard
            icon={ShoppingBag} iconBg="bg-blue-50 text-blue-600"
            label="Orders today" value={String(metrics.orders_today)}
            sub={`AOV ${inr(metrics.avg_order_value)}`}
          />
          <MetricCard
            icon={TrendingDown} iconBg="bg-amber-50 text-amber-600"
            label="Avg Order Value" value={inr(metrics.avg_order_value)}
            sub={metrics.orders_today === 0 ? 'No orders yet' : 'computed live'}
          />
        </div>
      )}

      {/* Mid metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AlertCard
            icon={ChefHat} label="Kitchen queue" value={`${metrics.active_kitchen} orders`}
            warning={metrics.active_kitchen > 0 ? `${metrics.active_kitchen} in progress` : 'All clear'}
            onClick={() => navigate('/kds')}
            tone={metrics.active_kitchen > 8 ? 'rose' : 'amber'}
          />
          <MetricCard
            icon={CreditCard} iconBg="bg-blue-50 text-blue-700"
            label="Payments failed today" value={String(metrics.failed_payments)}
            sub={metrics.failed_payments === 0 ? 'Healthy' : 'Investigate'}
          />
          <MetricCard
            icon={Utensils} iconBg="bg-brand-50 text-brand-700"
            label="Peak hour"
            value={(() => {
              const peak = [...metrics.hourly].sort((a, b) => b.orders - a.orders)[0];
              return peak && peak.orders > 0 ? `${formatHour(peak.hour)} – ${formatHour(peak.hour + 1)}` : '—';
            })()}
            sub={(() => {
              const peak = [...metrics.hourly].sort((a, b) => b.orders - a.orders)[0];
              return peak && peak.orders > 0 ? `${peak.orders} orders · ${inr(peak.sales)}` : 'Awaiting first order';
            })()}
          />
        </div>
      )}

      {/* Hourly sales chart */}
      {metrics && (
        <section className="bg-white p-6 rounded-2xl shadow-card">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-base font-bold">Sales by hour</h2>
              <p className="text-sm text-slate-500">Today, 9 AM – 11 PM (in branch local time)</p>
            </div>
          </div>
          <SimpleBarChart
            data={metrics.hourly.slice(9, 23).map(h => ({
              label: formatHour(h.hour),
              value: h.sales,
              highlight: h.sales === Math.max(...metrics.hourly.map(x => x.sales)) && h.sales > 0,
            }))}
            formatValue={n => inr(n)}
            height={200}
          />
        </section>
      )}

      {/* Live orders + scope note */}
      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 pt-5 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Live orders</h2>
            <p className="text-sm text-slate-500">{liveOrders.length === 0 ? 'No active orders yet' : `${liveOrders.length} in pipeline`}</p>
          </div>
          <button
            onClick={() => navigate('/orders')}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
          >
            View all <ChevronRight className="size-4" />
          </button>
        </header>
        {liveOrders.length === 0 ? (
          <div className="px-6 pb-8 text-center text-slate-500 text-sm">
            <p>Place a test order from the customer app to see it appear here in real time.</p>
            <p className="mt-2 text-xs">
              Try{' '}
              <a
                href={`${(import.meta.env.VITE_CUSTOMER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8081'}/${branch?.slug ?? branches[0]?.slug ?? 'the-spice-route'}/t/sgkor-t1`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-brand-600 hover:underline"
              >
                /{branch?.slug ?? branches[0]?.slug ?? 'the-spice-route'}/t/sgkor-t1
              </a>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {liveOrders.map(o => (
              <li
                key={o.id}
                className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50 cursor-pointer"
                onClick={() => navigate('/orders')}
              >
                <span className="font-mono text-xs font-bold text-slate-500 w-24 shrink-0">{o.code}</span>
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <TypePill type={o.type} />
                  {o.table_label && <span className="text-xs text-slate-500 font-medium">{o.table_label}</span>}
                </div>
                <span className="flex-1 min-w-0 text-sm font-medium truncate">
                  {o.customer_name ?? <span className="text-slate-400 italic">Anonymous</span>}
                </span>
                <span className="text-xs text-slate-500 hidden md:inline">{o.item_count} items</span>
                <OrderStatusPill status={o.status} />
                <span className="font-semibold text-sm w-16 text-right">{inr(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, iconBg, label, value, sub,
}: { icon: any; iconBg: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-card">
      <div className="flex items-start gap-3">
        <span className={cls('size-10 grid place-items-center rounded-lg', iconBg)}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-2xl font-extrabold mt-2">{value}</p>
          <p className="text-xs mt-3 inline-flex items-center gap-1 text-slate-500">
            <ArrowUpRight className="size-3.5" />
            {sub}
          </p>
        </div>
      </div>
    </div>
  );
}

function AlertCard({
  icon: Icon, label, value, warning, onClick, tone,
}: { icon: any; label: string; value: string; warning: string; onClick?: () => void; tone: 'rose' | 'amber' }) {
  const map = {
    rose:  { bg: 'bg-rose-100 text-rose-600',     text: 'text-rose-600' },
    amber: { bg: 'bg-amber-100 text-amber-700', text: 'text-amber-700' },
  }[tone];
  return (
    <button
      onClick={onClick}
      className="text-left bg-white p-5 rounded-2xl shadow-card relative w-full hover:shadow-cardHover transition"
    >
      <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-rose-600 text-xs font-semibold">
        <AlertTriangle className="size-3.5" /> Alert
      </span>
      <div className="flex items-start gap-3">
        <span className={cls('size-10 grid place-items-center rounded-lg', map.bg)}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-2xl font-extrabold mt-2">{value}</p>
          <p className={cls('text-xs mt-3 inline-flex items-center gap-1', map.text)}>
            <ArrowDownRight className="size-3.5" />
            {warning}
          </p>
        </div>
      </div>
    </button>
  );
}

function formatHour(h: number): string {
  const ampm = h >= 12 ? 'p' : 'a';
  const hh = h % 12 || 12;
  return `${hh}${ampm}`;
}
