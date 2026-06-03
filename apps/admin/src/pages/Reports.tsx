import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Star, TrendingUp, Users } from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { SimpleBarChart, Donut, Sparkline } from '../components/Charts';
import { useTenant } from '../lib/tenant';
import { getReports, type ReportData } from '../lib/api';

type Range = 'today' | 'week' | 'month' | 'quarter';

export default function Reports() {
  const { scopedRestaurantIds } = useTenant();
  const [range, setRange] = useState<Range>('today');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getReports(scopedRestaurantIds, range)); }
    catch (e: any) { setError(e.message ?? 'Failed to load reports'); }
    finally { setLoading(false); }
  }, [scopedRestaurantIds, range]);

  useEffect(() => { refresh(); }, [refresh]);

  const hourlyBars = (data?.hourly ?? []).map(h => ({
    label: formatHour(h.hour),
    value: h.sales,
    highlight: h.hour === 13,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Sales, items, payments — across selected scope."
        actions={
          <>
            <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm">
              {(['today','week','month','quarter'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cls('px-4 py-1.5 rounded-full font-semibold capitalize', range === r ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={() => alert('PDF export coming soon — for now, use Reports → Customer Insights in Supabase')}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
            >
              <Download className="size-4" /> Export PDF
            </button>
          </>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BigStat label="Revenue"      value={inr(data.revenue)} series={data.hourly.map(h => h.sales)} color="#EA580C" />
            <BigStat label="Orders"       value={String(data.orders)} series={data.hourly.map(h => h.orders)}  color="#3B82F6" />
            <BigStat label="AOV"          value={inr(data.aov)} series={data.hourly.map(h => h.sales)} color="#A855F7" />
            <BigStat label="Top item"     value={data.top_items[0]?.name?.slice(0, 14) ?? '—'} series={[5,6,7,8,9,10,11,12,13]} color="#10B981" />
          </div>

          <section className="bg-white rounded-2xl shadow-card p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-bold">Sales by hour</h2>
                <p className="text-sm text-slate-500 capitalize">{range}</p>
              </div>
            </div>
            <SimpleBarChart data={hourlyBars} formatValue={n => inr(n)} height={200} />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2 bg-white rounded-2xl shadow-card overflow-hidden">
              <header className="px-6 pt-5 pb-4">
                <h2 className="text-base font-bold">Top selling items</h2>
                <p className="text-sm text-slate-500">Ranked by revenue</p>
              </header>
              <ul className="divide-y divide-slate-100">
                {data.top_items.map((t, i) => (
                  <li key={t.name} className="px-6 py-3 flex items-center gap-3">
                    <span className={cls(
                      'size-7 grid place-items-center rounded-full text-xs font-bold shrink-0',
                      i === 0 ? 'bg-amber-100 text-amber-700' :
                      i === 1 ? 'bg-slate-100 text-slate-600' :
                      i === 2 ? 'bg-orange-100 text-orange-700' :
                                'bg-slate-100 text-slate-500',
                    )}>
                      {i + 1}
                    </span>
                    {t.image_url ? (
                      <img src={t.image_url} alt={t.name} className="size-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="size-10 rounded-lg bg-slate-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{t.name}</p>
                      <p className="text-xs text-slate-500 inline-flex items-center gap-1">
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                        {t.qty_sold} sold{t.category && ` · ${t.category}`}
                      </p>
                    </div>
                    <span className="font-semibold text-sm w-24 text-right">{inr(t.revenue)}</span>
                  </li>
                ))}
                {data.top_items.length === 0 && (
                  <li className="px-6 py-8 text-sm text-center text-slate-500">No sales in this range.</li>
                )}
              </ul>
            </section>

            <section className="bg-white rounded-2xl shadow-card p-6">
              <h2 className="text-base font-bold mb-1">Payment methods</h2>
              <p className="text-sm text-slate-500 mb-5">Split of settled volume</p>
              {data.by_method.length ? (
                <Donut slices={data.by_method} size={170} />
              ) : (
                <p className="text-slate-500 text-sm py-12 text-center">No payments yet</p>
              )}
            </section>
          </div>

          <section className="bg-white rounded-2xl shadow-card p-6">
            <h2 className="text-base font-bold mb-1">7-day trend</h2>
            <p className="text-sm text-slate-500 mb-4">Revenue by day of week</p>
            <div className="grid grid-cols-7 gap-2">
              {data.weekly.map((amount, i) => {
                const max = Math.max(1, ...data.weekly);
                const pct = (amount / max) * 100;
                const d = new Date(); d.setDate(d.getDate() - (6 - i));
                return (
                  <div key={i} className="text-center">
                    <p className="text-xs text-slate-500 mb-2">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</p>
                    <div className="h-32 flex items-end justify-center">
                      <div className="w-full rounded-md bg-brand-600" style={{ height: `${pct}%`, minHeight: amount ? 4 : 0 }} />
                    </div>
                    <p className="text-xs font-semibold mt-2">{amount > 0 ? inr(amount) : '—'}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ReportTile icon={Users}      label="Orders"             value={String(data.orders)}  sub="In this range" />
            <ReportTile icon={TrendingUp} label="Revenue"            value={inr(data.revenue)}    sub="Excluding cancellations" />
            <ReportTile icon={FileText}   label="Average order"      value={inr(data.aov)}        sub="Across all orders" />
          </div>
        </>
      )}
    </div>
  );
}

function BigStat({
  label, value, series, color,
}: { label: string; value: string; series: number[]; color: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5 flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-2xl font-bold mt-1.5">{value}</p>
      </div>
      <Sparkline values={series.length ? series : [0]} color={color} width={80} height={36} />
    </div>
  );
}

function ReportTile({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-5 flex items-start gap-3">
      <span className="size-10 grid place-items-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function formatHour(h: number): string {
  const ampm = h >= 12 ? 'p' : 'a';
  const hh = h % 12 || 12;
  return `${hh}${ampm}`;
}
