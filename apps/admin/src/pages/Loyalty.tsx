import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Crown, Gem, History, Search, TrendingUp, Users } from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { useTenant } from '../lib/tenant';
import { listLoyaltyMembers, listLoyaltyTransactions, type LoyaltyMemberRow, type LoyaltyTxnRow } from '../lib/api';

const TIER_STYLE = {
  Silver:   { bg: 'bg-slate-100 text-slate-700', icon: Gem },
  Gold:     { bg: 'bg-amber-100 text-amber-700', icon: Gem },
  Platinum: { bg: 'bg-purple-100 text-purple-700', icon: Crown },
} as const;

const TXN_STYLE = {
  earn:   { color: 'text-emerald-600', label: 'Earned' },
  redeem: { color: 'text-rose-600',    label: 'Redeemed' },
  bonus:  { color: 'text-amber-600',   label: 'Bonus' },
  expire: { color: 'text-slate-500',   label: 'Expired' },
  refund: { color: 'text-blue-600',    label: 'Refund' },
} as const;

function tierFor(earned: number): keyof typeof TIER_STYLE {
  if (earned >= 2000) return 'Platinum';
  if (earned >= 500)  return 'Gold';
  return 'Silver';
}

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function Loyalty() {
  const { scopedRestaurantIds } = useTenant();
  const [members, setMembers] = useState<LoyaltyMemberRow[]>([]);
  const [txns, setTxns] = useState<LoyaltyTxnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ms = await listLoyaltyMembers(scopedRestaurantIds);
      setMembers(ms);
      const ts = ms.length ? await listLoyaltyTransactions(ms.map(m => m.id)) : [];
      setTxns(ts);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load loyalty data');
    } finally {
      setLoading(false);
    }
  }, [scopedRestaurantIds]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return members.filter(m => !q || m.customer_name.toLowerCase().includes(q) || m.phone.includes(q));
  }, [members, query]);

  const totals = useMemo(() => ({
    totalMembers: members.length,
    totalPoints: members.reduce((s, m) => s + m.balance, 0),
    totalRedeemed: members.reduce((s, m) => s + m.lifetime_redeemed, 0),
  }), [members]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loyalty Coins"
        subtitle={loading ? 'Loading…' : `${totals.totalMembers} members · ${totals.totalPoints.toLocaleString('en-IN')} points outstanding · ${totals.totalRedeemed.toLocaleString('en-IN')} points redeemed`}
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <section className="bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-2xl p-6 shadow-card relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 size-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h2 className="text-lg font-bold">FoodCoins program</h2>
            <p className="text-white/85 text-sm mt-1 max-w-md">
              Customers earn 5 points per ₹100 spent. Up to 10% of any order can be redeemed in points.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-6">
              <Stat label="Earn rate"     value="5 pts / ₹100" />
              <Stat label="Max redeem"    value="10% of order" />
              <Stat label="Point expiry"  value="180 days" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Users}      iconBg="bg-blue-50 text-blue-600"       label="Active members"      value={String(totals.totalMembers)} sub="Across selected scope" />
        <StatCard icon={Coins}      iconBg="bg-amber-50 text-amber-700"     label="Points outstanding"  value={totals.totalPoints.toLocaleString('en-IN')} sub={`≈ ${inr(totals.totalPoints)} liability`} />
        <StatCard icon={TrendingUp} iconBg="bg-emerald-50 text-emerald-700" label="Redeemed (lifetime)" value={totals.totalRedeemed.toLocaleString('en-IN')} sub="Across all members" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white rounded-2xl shadow-card overflow-hidden">
          <header className="px-6 pt-5 pb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Members</h2>
              <p className="text-sm text-slate-500">Sorted by balance</p>
            </div>
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full rounded-full bg-slate-100 pl-9 pr-3 py-1.5 text-sm outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Tier</th>
                <th className="px-6 py-3 text-right">Balance</th>
                <th className="px-6 py-3 text-right">Earned</th>
                <th className="px-6 py-3 text-right">Redeemed</th>
                <th className="px-6 py-3">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(m => {
                const tierKey = tierFor(m.lifetime_earned);
                const tier = TIER_STYLE[tierKey];
                const TierIcon = tier.icon;
                const d = daysSince(m.last_order_at);
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <p className="font-semibold">{m.customer_name}</p>
                      <p className="text-xs text-slate-500">{m.phone}</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cls('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tier.bg)}>
                        <TierIcon className="size-3.5" />
                        {tierKey}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-amber-700">{m.balance}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{m.lifetime_earned}</td>
                    <td className="px-6 py-3 text-right text-slate-700">{m.lifetime_redeemed}</td>
                    <td className="px-6 py-3 text-xs text-slate-500">
                      {d === 0 ? 'Today' : d === 999 ? '—' : `${d}d ago`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-slate-500 py-12">No loyalty members yet.</p>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-card overflow-hidden">
          <header className="px-6 pt-5 pb-3">
            <h2 className="text-base font-bold inline-flex items-center gap-2">
              <History className="size-4" /> Recent transactions
            </h2>
          </header>
          <ul className="divide-y divide-slate-100">
            {txns.map(t => {
              const style = TXN_STYLE[t.type];
              return (
                <li key={t.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{t.member}</p>
                    <p className="text-xs text-slate-500">
                      {style.label}{t.order_code && ` · ${t.order_code}`}
                    </p>
                  </div>
                  <span className={cls('font-mono font-bold text-sm', style.color)}>
                    {t.points > 0 ? '+' : ''}{t.points}
                  </span>
                </li>
              );
            })}
            {!loading && txns.length === 0 && (
              <li className="px-6 py-8 text-center text-sm text-slate-500">No transactions yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-white/70 font-semibold">{label}</p>
      <p className="text-lg font-bold mt-1">{value}</p>
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
