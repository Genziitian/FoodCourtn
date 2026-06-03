import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Gem, Mail, Phone, Search, Star, TrendingUp, Users } from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Drawer } from '../components/Drawer';
import { listCustomers, listOrders, type AdminCustomerRow, type AdminOrder } from '../lib/api';

const TIER_STYLE = {
  Silver:   { bg: 'bg-slate-100 text-slate-700',   icon: Gem },
  Gold:     { bg: 'bg-amber-100 text-amber-700',   icon: Gem },
  Platinum: { bg: 'bg-purple-100 text-purple-700', icon: Crown },
} as const;

const TAG_STYLE: Record<string, string> = {
  vip:        'bg-purple-50 text-purple-700',
  regular:    'bg-blue-50 text-blue-700',
  new:        'bg-emerald-50 text-emerald-700',
  complainer: 'bg-rose-50 text-rose-700',
};

type Sort = 'spent' | 'orders' | 'recent';

function tierFor(spent: number): keyof typeof TIER_STYLE {
  if (spent >= 25000) return 'Platinum';
  if (spent >= 8000)  return 'Gold';
  return 'Silver';
}

function minutesAgo(iso: string | null): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function Customers() {
  const [rows, setRows] = useState<AdminCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<'all' | string>('all');
  const [sort, setSort] = useState<Sort>('spent');
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listCustomers()); }
    catch (e: any) { setError(e.message ?? 'Failed to load customers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...rows]
      .filter(c => {
        if (tag !== 'all' && !(c.tags ?? []).includes(tag)) return false;
        const nm = (c.name ?? '').toLowerCase();
        if (q && !nm.includes(q) && !(c.phone ?? '').includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === 'spent')  return b.total_spent - a.total_spent;
        if (sort === 'orders') return b.total_orders - a.total_orders;
        return minutesAgo(a.last_order_at) - minutesAgo(b.last_order_at);
      });
  }, [rows, query, tag, sort]);

  const totals = useMemo(() => ({
    count: rows.length,
    spent: rows.reduce((s, c) => s + c.total_spent, 0),
    vip: rows.filter(c => (c.tags ?? []).includes('vip') || c.total_spent > 25000).length,
    repeat: rows.filter(c => c.total_orders > 5).length,
  }), [rows]);

  const open = filtered.find(c => c.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        subtitle={loading ? 'Loading…' : `${totals.count} on file · ${totals.vip} VIPs · ${totals.repeat} repeat customers · ${inr(totals.spent)} lifetime`}
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Users}      iconBg="bg-blue-50 text-blue-600"       label="Total customers"  value={String(totals.count)} sub="On file" />
        <StatTile icon={Crown}      iconBg="bg-purple-50 text-purple-700"   label="VIPs"             value={String(totals.vip)}   sub={`${totals.count ? Math.round(totals.vip / totals.count * 100) : 0}% of base`} />
        <StatTile icon={TrendingUp} iconBg="bg-emerald-50 text-emerald-700" label="Repeat customers" value={String(totals.repeat)} sub="5+ orders" />
        <StatTile icon={Star}       iconBg="bg-amber-50 text-amber-700"     label="Lifetime spent"   value={inr(totals.spent)}    sub="Total revenue" />
      </div>

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full rounded-full bg-slate-100 pl-10 pr-4 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            {(['all','vip','regular','new','complainer'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={cls('px-3 py-1.5 rounded-full font-semibold capitalize', tag === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="ml-auto inline-flex items-center gap-2 text-sm">
            <span className="text-slate-500">Sort:</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as Sort)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium"
            >
              <option value="spent">Lifetime spend</option>
              <option value="orders">Order count</option>
              <option value="recent">Most recent</option>
            </select>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Tags</th>
                <th className="px-6 py-3">Tier</th>
                <th className="px-6 py-3 text-right">Orders</th>
                <th className="px-6 py-3 text-right">Lifetime</th>
                <th className="px-6 py-3">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => {
                const tierKey = tierFor(c.total_spent);
                const tier = TIER_STYLE[tierKey];
                const TierIcon = tier.icon;
                const initials = (c.name ?? 'C').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="size-9 grid place-items-center rounded-full bg-brand-600 text-white text-xs font-bold shrink-0">{initials}</span>
                        <div>
                          <p className="font-semibold">{c.name ?? 'Customer'}</p>
                          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                            <Phone className="size-3" /> {c.phone ?? '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags ?? []).map(t => (
                          <span key={t} className={cls('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', TAG_STYLE[t] ?? 'bg-slate-100 text-slate-700')}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cls('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tier.bg)}>
                        <TierIcon className="size-3.5" />
                        {tierKey}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-semibold">{c.total_orders}</td>
                    <td className="px-6 py-3 text-right font-semibold">{inr(c.total_spent)}</td>
                    <td className="px-6 py-3 text-xs text-slate-500">{c.last_order_at ? formatRelative(c.last_order_at) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-slate-500 py-12">No customers match.</p>
          )}
        </div>
      </div>

      <CustomerDrawer customer={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function CustomerDrawer({ customer, onClose }: { customer: AdminCustomerRow | null; onClose: () => void }) {
  const [recent, setRecent] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setLoading(true);
    listOrders({ customerId: customer.id, limit: 5 })
      .then(setRecent)
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [customer]);

  if (!customer) return null;
  const initials = (customer.name ?? 'C').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Drawer open onClose={onClose} title={customer.name ?? 'Customer'} subtitle={`Customer · ${customer.phone ?? '—'}`} width="lg">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <span className="size-16 grid place-items-center rounded-full bg-brand-600 text-white font-bold text-xl">
            {initials}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1 mb-2">
              {(customer.tags ?? []).map(t => (
                <span key={t} className={cls('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', TAG_STYLE[t] ?? 'bg-slate-100 text-slate-700')}>
                  {t}
                </span>
              ))}
            </div>
            <p className="text-sm text-slate-600 inline-flex items-center gap-1.5"><Phone className="size-3.5" />{customer.phone ?? '—'}</p>
            {customer.email && <p className="text-sm text-slate-600 inline-flex items-center gap-1.5 mt-0.5"><Mail className="size-3.5" />{customer.email}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Orders"        value={String(customer.total_orders)} />
          <Stat label="Lifetime"      value={inr(customer.total_spent)} />
          <Stat label="Joined"        value={new Date(customer.created_at).toLocaleDateString('en-IN')} />
        </div>

        <section>
          <h3 className="text-sm font-bold mb-3">Recent orders</h3>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
              {recent.map(o => (
                <li key={o.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
                  <span className="font-mono text-xs font-bold text-slate-500 w-24 shrink-0">{o.code}</span>
                  <span className="flex-1 text-sm text-slate-700 truncate">
                    {o.items.slice(0, 2).map(i => i.name).join(', ')}
                    {o.items.length > 2 && ` +${o.items.length - 2}`}
                  </span>
                  <span className="font-semibold text-sm">{inr(o.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function StatTile({
  icon: Icon, iconBg, label, value, sub,
}: { icon: any; iconBg: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-card flex items-start gap-3">
      <span className={cls('size-9 grid place-items-center rounded-lg', iconBg)}><Icon className="size-4" /></span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-xl font-bold mt-1">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const m = minutesAgo(iso);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
}
