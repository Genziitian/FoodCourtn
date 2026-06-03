import { useCallback, useEffect, useState } from 'react';
import {
  Building2, Check, CreditCard, Lock, Smartphone, Wallet,
} from 'lucide-react';
import type { PaymentProvider } from '@foodcourt/shared';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../../components/PageHeader';
import {
  listPaymentGateways, listBranches, listPayments,
  type PaymentGatewayRow, type BranchRow, type AdminPaymentRowDb,
} from '../../lib/api';

const PROVIDER_META: Record<PaymentProvider, { icon: any; color: string; display: string }> = {
  razorpay: { icon: CreditCard, color: 'bg-blue-100 text-blue-700',     display: 'Razorpay' },
  stripe:   { icon: CreditCard, color: 'bg-purple-100 text-purple-700', display: 'Stripe' },
  phonepe:  { icon: Smartphone, color: 'bg-indigo-100 text-indigo-700', display: 'PhonePe' },
  paytm:    { icon: Wallet,     color: 'bg-sky-100 text-sky-700',       display: 'Paytm' },
  cashfree: { icon: CreditCard, color: 'bg-emerald-100 text-emerald-700', display: 'Cashfree' },
};

const PROVIDER_ORDER: PaymentProvider[] = ['razorpay', 'phonepe', 'paytm', 'cashfree', 'stripe'];

export default function SuperPayments() {
  const [gateways, setGateways] = useState<PaymentGatewayRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRowDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [g, b, p] = await Promise.all([
        listPaymentGateways([]),
        listBranches(),
        listPayments([]),
      ]);
      setGateways(g); setBranches(b); setPayments(p);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load payment data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const totalVolume = payments
    .filter(pay => pay.status === 'success')
    .reduce((s, x) => s + x.amount, 0);

  const configuredGateways = gateways.filter(g => g.is_active && g.key_id);
  const totalBranchesConfigured = new Set(configuredGateways.map(g => g.restaurant_id)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Integrations"
        subtitle="Read-only overview. Each organization's admin manages their own payment keys directly — you cannot view or edit them."
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-900 flex items-start gap-3">
        <Lock className="size-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">Super admins don't manage payment gateways</p>
          <p className="text-xs text-purple-900/85">
            Org admins paste their own Razorpay/Stripe/PhonePe/Paytm/Cashfree keys per-branch from <strong>Admin → Payment Keys</strong>.
            You can see which branches have a method active and how much volume flowed — never the keys or secrets.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile label="Platform volume today" value={inr(totalVolume)} sub="Settled across all gateways" />
        <StatTile label="Branches connected"    value={`${totalBranchesConfigured} / ${branches.length}`} sub="With at least one active key" />
        <StatTile label="Active gateway rows"   value={String(configuredGateways.length)} sub="Across all branches" />
      </div>

      {/* Per-provider coverage */}
      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold">Provider coverage</h2>
          <p className="text-sm text-slate-500">How many branches have each provider configured + volume today.</p>
        </header>
        <ul className="divide-y divide-slate-100">
          {PROVIDER_ORDER.map(provider => {
            const meta = PROVIDER_META[provider];
            const Icon = meta.icon;
            const branchesUsing = configuredGateways.filter(g => g.provider === provider).length;
            const volume = payments
              .filter(pay => pay.provider === provider && pay.status === 'success')
              .reduce((s, x) => s + x.amount, 0);

            return (
              <li key={provider} className="px-6 py-4 flex items-center gap-4">
                <span className={cls('size-12 grid place-items-center rounded-xl', meta.color)}>
                  <Icon className="size-6" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg">{meta.display}</p>
                  <p className="text-xs text-slate-500">
                    {branchesUsing > 0
                      ? `${branchesUsing} branch${branchesUsing === 1 ? '' : 'es'} configured`
                      : 'No branches have configured this provider'}
                  </p>
                </div>
                <div className="text-right hidden md:block">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Today</p>
                  <p className="font-bold">{inr(volume)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Per-branch coverage (presence only — never keys/secrets) */}
      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold">Branch coverage</h2>
          <p className="text-sm text-slate-500">Which branches have a payment method active. Keys and secrets are never visible.</p>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
              <th className="px-6 py-3">Branch</th>
              <th className="px-6 py-3">Provider</th>
              <th className="px-6 py-3 text-center">Active</th>
              <th className="px-6 py-3 text-center">Mode</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {configuredGateways.map(g => {
              const branch = branches.find(b => b.id === g.restaurant_id);
              const meta = PROVIDER_META[g.provider];
              return (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-3.5 text-slate-400" />
                      <span className="font-semibold">{branch?.name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={cls('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold', meta?.color ?? 'bg-slate-100 text-slate-600')}>
                      {meta?.display ?? g.provider}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {g.is_active ? <Check className="size-4 text-emerald-500 mx-auto" /> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className={cls(
                      'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                      g.test_mode ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
                    )}>
                      {g.test_mode ? 'Test' : 'Live'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && configuredGateways.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-sm text-slate-500">
                  No branches have a payment method active yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-extrabold mt-1.5">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </div>
  );
}
