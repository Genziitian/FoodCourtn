import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote, CreditCard, Download, RefreshCcw, RotateCcw, Search, Smartphone, Wallet,
} from 'lucide-react';
import type { PaymentProvider, PaymentStatus } from '@foodcourt/shared';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Donut } from '../components/Charts';
import { PaymentStatusPill } from '../components/StatusPill';
import { useTenant } from '../lib/tenant';
import { listPayments, refundPayment, type AdminPaymentRowDb } from '../lib/api';

const PROVIDER_LOGO: Record<PaymentProvider | 'cash', { label: string; icon: any; color: string }> = {
  razorpay: { label: 'Razorpay', icon: CreditCard, color: 'text-blue-600 bg-blue-50' },
  stripe:   { label: 'Stripe',   icon: CreditCard, color: 'text-purple-600 bg-purple-50' },
  phonepe:  { label: 'PhonePe',  icon: Smartphone, color: 'text-indigo-600 bg-indigo-50' },
  paytm:    { label: 'Paytm',    icon: Wallet,     color: 'text-sky-600 bg-sky-50' },
  cashfree: { label: 'Cashfree', icon: CreditCard, color: 'text-emerald-600 bg-emerald-50' },
  cash:     { label: 'Cash',     icon: Banknote,   color: 'text-amber-700 bg-amber-50' },
};

export default function Payments() {
  const { scopedRestaurantIds } = useTenant();
  const [rows, setRows] = useState<AdminPaymentRowDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listPayments(scopedRestaurantIds)); }
    catch (e: any) { setError(e.message ?? 'Failed to load payments'); }
    finally { setLoading(false); }
  }, [scopedRestaurantIds]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (q && !p.order_code.toLowerCase().includes(q)
          && !p.customer_name.toLowerCase().includes(q)
          && !(p.gateway_payment_id?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, query, statusFilter]);

  const totals = useMemo(() => {
    const sum = (s: PaymentStatus) =>
      rows.filter(r => r.status === s).reduce((a, r) => a + r.amount, 0);
    const cnt = (s: PaymentStatus) => rows.filter(r => r.status === s).length;
    return {
      success: { count: cnt('success'), amount: sum('success') },
      pending: { count: cnt('pending'), amount: sum('pending') },
      failed:  { count: cnt('failed'),  amount: sum('failed') },
      refunded:{ count: cnt('refunded'),amount: rows.filter(r => r.status === 'refunded').reduce((a,r) => a + r.refunded_amount, 0) },
    };
  }, [rows]);

  const methodSlices = useMemo(() => {
    const m: Record<string, number> = {};
    rows.filter(r => r.status === 'success').forEach(r => {
      m[r.method] = (m[r.method] ?? 0) + r.amount;
    });
    const colors: Record<string, string> = {
      upi: '#3B82F6', card: '#A855F7', wallet: '#10B981', netbanking: '#0EA5E9', cash: '#F59E0B',
    };
    return Object.entries(m).map(([k, v]) => ({
      label: k.toUpperCase(),
      value: v,
      color: colors[k] ?? '#94A3B8',
    }));
  }, [rows]);

  const providerSlices = useMemo(() => {
    const m: Record<string, number> = {};
    rows.filter(r => r.status === 'success').forEach(r => {
      m[r.provider] = (m[r.provider] ?? 0) + r.amount;
    });
    const colors: Record<string, string> = {
      razorpay: '#0EA5E9', stripe: '#A855F7', phonepe: '#6366F1', paytm: '#06B6D4', cashfree: '#10B981', cash: '#F59E0B',
    };
    return Object.entries(m).map(([k, v]) => ({
      label: PROVIDER_LOGO[k as keyof typeof PROVIDER_LOGO]?.label ?? k,
      value: v,
      color: colors[k] ?? '#94A3B8',
    }));
  }, [rows]);

  const refund = async (p: AdminPaymentRowDb) => {
    setRefundingId(p.id);
    try {
      await refundPayment(p.id, p.amount);
      setRows(rs => rs.map(r => r.id === p.id ? { ...r, status: 'refunded', refunded_amount: p.amount } : r));
    } catch (e) { console.error(e); }
    finally { setRefundingId(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle={loading ? 'Loading…' : `${totals.success.count} successful · ${totals.failed.count} failed · ${totals.refunded.count} refunded`}
        actions={
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
          >
            <RefreshCcw className="size-4" /> Refresh
          </button>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile color="emerald" label="Successful"  count={totals.success.count}  amount={totals.success.amount} />
        <StatTile color="amber"   label="Pending"     count={totals.pending.count}  amount={totals.pending.amount} />
        <StatTile color="rose"    label="Failed"      count={totals.failed.count}   amount={totals.failed.amount} />
        <StatTile color="slate"   label="Refunded"    count={totals.refunded.count} amount={totals.refunded.amount} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white rounded-2xl shadow-card p-6">
          <h2 className="text-base font-bold mb-1">By method</h2>
          <p className="text-sm text-slate-500 mb-5">{inr(totals.success.amount)} settled</p>
          {methodSlices.length ? (
            <Donut slices={methodSlices} centerLabel={{ top: 'Total', bottom: inr(totals.success.amount) }} size={170} />
          ) : (
            <p className="text-slate-500 text-sm py-12 text-center">No payments yet</p>
          )}
        </section>
        <section className="bg-white rounded-2xl shadow-card p-6">
          <h2 className="text-base font-bold mb-1">By gateway</h2>
          <p className="text-sm text-slate-500 mb-5">Compare provider volumes</p>
          {providerSlices.length ? (
            <Donut slices={providerSlices} centerLabel={{ top: 'Providers', bottom: String(providerSlices.length) }} size={170} />
          ) : (
            <p className="text-slate-500 text-sm py-12 text-center">No payments yet</p>
          )}
        </section>
      </div>

      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by order code, customer, or gateway txn id..."
              className="w-full rounded-full bg-slate-100 pl-10 pr-4 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            {(['all','success','pending','failed','refunded'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cls('px-3 py-1.5 rounded-full font-semibold capitalize', statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}
              >
                {s}
              </button>
            ))}
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3">Order</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Gateway</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Notes</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => {
                const prov = PROVIDER_LOGO[p.provider];
                const ProvIcon = prov.icon;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <p className="font-mono font-bold">{p.order_code}</p>
                      {p.gateway_payment_id && (
                        <p className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{p.gateway_payment_id}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 font-medium">{p.customer_name}</td>
                    <td className="px-6 py-3">
                      <span className={cls('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold', prov.color)}>
                        <ProvIcon className="size-3.5" />
                        {prov.label}
                      </span>
                    </td>
                    <td className="px-6 py-3 uppercase text-xs font-bold text-slate-600">{p.method}</td>
                    <td className="px-6 py-3 text-right">
                      <p className="font-semibold">{inr(p.amount)}</p>
                      {p.refunded_amount > 0 && (
                        <p className="text-xs text-rose-600">-{inr(p.refunded_amount)} refunded</p>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <PaymentStatusPill status={p.status as PaymentStatus} />
                      {p.attempt_no > 1 && (
                        <p className="text-[10px] text-slate-500 mt-0.5">Attempt #{p.attempt_no}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 max-w-[220px]">
                      <p className="text-xs text-slate-600 truncate" title={p.failure_reason ?? ''}>
                        {p.failure_reason ?? <span className="text-slate-400 italic">—</span>}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.status === 'success' && p.refunded_amount === 0 && p.provider !== 'cash' && (
                          <button
                            onClick={() => refund(p)}
                            disabled={refundingId === p.id}
                            className="inline-flex items-center gap-1 rounded-full border border-rose-200 text-rose-700 px-3 py-1.5 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50"
                          >
                            <RotateCcw className="size-3.5" />
                            {refundingId === p.id ? 'Refunding…' : 'Refund'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-slate-500 py-12">No payments match your filter.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatTile({ color, label, count, amount }: { color: 'emerald'|'amber'|'rose'|'slate'; label: string; count: number; amount: number }) {
  const map = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-700',   dot: 'bg-slate-500' },
  }[color];
  return (
    <div className="bg-white p-5 rounded-2xl shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
        <span className={cls('size-2 rounded-full', map.dot)} />
        {label}
      </p>
      <p className="text-2xl font-bold mt-2">{count}</p>
      <p className={cls('text-sm font-semibold mt-0.5', map.text)}>{inr(amount)}</p>
    </div>
  );
}

void Download;
