import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CreditCard, ShieldCheck, Smartphone, Wallet, Eye, EyeOff, RefreshCcw,
} from 'lucide-react';
import type { PaymentProvider } from '@foodcourt/shared';
import { cls } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Toggle } from '../components/Toggle';
import { useTenant } from '../lib/tenant';
import {
  listGatewaysForOrg, listPaymentProviders, upsertPaymentGateway, updatePaymentGateway,
  type OrgGatewayRow, type PaymentProviderRow,
} from '../lib/api';

const PROVIDER_META: Record<PaymentProvider, { name: string; icon: any; color: string; tagline: string }> = {
  razorpay: { name: 'Razorpay', icon: CreditCard, color: 'bg-blue-100 text-blue-700',     tagline: 'UPI, Cards, Netbanking, Wallets' },
  stripe:   { name: 'Stripe',   icon: CreditCard, color: 'bg-purple-100 text-purple-700', tagline: 'International cards' },
  phonepe:  { name: 'PhonePe',  icon: Smartphone, color: 'bg-indigo-100 text-indigo-700', tagline: 'UPI-first, PhonePe wallet' },
  paytm:    { name: 'Paytm',    icon: Wallet,     color: 'bg-sky-100 text-sky-700',       tagline: 'Wallets, UPI' },
  cashfree: { name: 'Cashfree', icon: CreditCard, color: 'bg-emerald-100 text-emerald-700', tagline: 'UPI, Cards, Payouts' },
};

export default function PaymentsConfig() {
  const { org, branches } = useTenant();
  const branchIds = branches.map(b => b.id);
  const [providers, setProviders] = useState<PaymentProviderRow[]>([]);
  const [gateways, setGateways] = useState<OrgGatewayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [pp, gs] = await Promise.all([
        listPaymentProviders(),
        listGatewaysForOrg(branchIds),
      ]);
      setProviders(pp);
      setGateways(gs);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load payment configuration');
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchIds.join(',')]);

  useEffect(() => { refresh(); }, [refresh]);

  // Every provider we support is shown directly — admins configure what they
  // actually use. No super-admin "enable" gate. Providers without a paste are
  // simply inactive on that branch.
  const PROVIDER_ORDER = ['razorpay', 'phonepe', 'paytm', 'cashfree', 'stripe'] as const;
  const enabledProviders = useMemo(() => {
    // Take the rows we have from payment_providers (which carries display_name
    // + tagline), but fall back to a minimal row if a provider isn't seeded.
    return PROVIDER_ORDER.map(p => {
      const row = providers.find(x => x.provider === p);
      return row ?? {
        provider: p,
        display_name: p.charAt(0).toUpperCase() + p.slice(1),
        tagline: '',
        is_enabled: true,
      };
    });
  }, [providers]);

  const byBranch = useMemo(() => {
    const m = new Map<string, { branch_id: string; branch_name: string; gateways: OrgGatewayRow[] }>();
    branches.forEach(b => m.set(b.id, { branch_id: b.id, branch_name: b.name, gateways: [] }));
    gateways.forEach(g => {
      const entry = m.get(g.restaurant_id);
      if (entry) entry.gateways.push(g);
    });
    return Array.from(m.values());
  }, [gateways, branches]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment configuration"
        subtitle={
          !org ? 'Pick a single branch to manage in the sidebar' :
          loading ? 'Loading…' :
          `${org.name} · ${branches.length} branch${branches.length === 1 ? '' : 'es'} · ${enabledProviders.length} provider${enabledProviders.length === 1 ? '' : 's'} available`
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 flex items-start gap-3">
        <ShieldCheck className="size-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">You manage every branch's payment keys from here</p>
          <p className="text-xs text-blue-900/85">
            Each branch can have its own merchant account so settlements land in different bank accounts. Toggle <strong>test/live</strong> per branch independently.
            Paste a Key ID + Secret for any provider you want to accept — leave the rest blank. Super admins never see your secrets.
          </p>
        </div>
      </div>

      <ul className="space-y-4">
        {byBranch.map(({ branch_id, branch_name, gateways: bgs }) => (
          <li key={branch_id} className="bg-white rounded-2xl shadow-card overflow-hidden">
            <header className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <Building2 className="size-5 text-slate-400" />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{branch_name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {bgs.filter(g => g.is_active).length} active gateway{bgs.filter(g => g.is_active).length === 1 ? '' : 's'}
                </p>
              </div>
            </header>

            <div className="p-4 space-y-3">
              {enabledProviders.map(p => {
                const existing = bgs.find(g => g.provider === p.provider);
                return (
                  <GatewayRowEditor
                    key={`${branch_id}-${p.provider}`}
                    branchId={branch_id}
                    provider={p}
                    existing={existing ?? null}
                    onSaved={refresh}
                  />
                );
              })}
              {enabledProviders.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-2">No providers enabled. Ask super admin.</p>
              )}
            </div>
          </li>
        ))}
        {!loading && branches.length === 0 && (
          <li className="bg-white rounded-2xl shadow-card p-10 text-center text-sm text-slate-500">
            No branches in your organization yet.
          </li>
        )}
      </ul>
    </div>
  );
}

function GatewayRowEditor({
  branchId, provider, existing, onSaved,
}: {
  branchId: string;
  provider: PaymentProviderRow;
  existing: OrgGatewayRow | null;
  onSaved: () => void;
}) {
  const meta = PROVIDER_META[provider.provider];
  const Icon = meta?.icon ?? CreditCard;

  const [keyId, setKeyId] = useState(existing?.key_id ?? '');
  const [secret, setSecret] = useState('');
  const [testMode, setTestMode] = useState(existing?.test_mode ?? true);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    setKeyId(existing?.key_id ?? '');
    setTestMode(existing?.test_mode ?? true);
  }, [existing?.id, existing?.key_id, existing?.test_mode]);

  const save = async () => {
    if (!keyId.trim()) { setErr('Key ID is required'); return; }
    setSaving(true); setErr(null); setSavedNote(null);
    try {
      await upsertPaymentGateway({
        restaurant_id: branchId,
        provider: provider.provider,
        key_id: keyId.trim(),
        secret_key: secret.trim() || undefined,
        is_active: true,
        is_primary: true,
        test_mode: testMode,
      });
      setSecret('');
      setSavedNote(existing ? 'Updated' : 'Connected — checkout uses this key now.');
      onSaved();
    } catch (e: any) {
      setErr(e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!existing) return;
    try {
      await updatePaymentGateway(existing.id, { is_active: !existing.is_active });
      onSaved();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3">
        <span className={cls('size-9 grid place-items-center rounded-lg', meta?.color ?? 'bg-slate-100 text-slate-600')}>
          <Icon className="size-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{provider.display_name}</p>
            {existing?.is_active && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Connected</span>
            )}
            <span className={cls(
              'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
              testMode ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
            )}>
              {testMode ? 'Test' : 'Live'}
            </span>
          </div>
          <p className="text-xs text-slate-500">{meta?.tagline ?? ''}</p>
        </div>
        {existing && (
          <Toggle checked={existing.is_active} onChange={toggleActive} />
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Key ID</span>
            <input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="rzp_test_… or rzp_live_…" className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 font-mono text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Secret key {existing && <span className="text-slate-400">(leave blank to keep current)</span>}</span>
            <div className="relative">
              <input
                value={secret}
                onChange={e => setSecret(e.target.value)}
                type={showSecret ? 'text' : 'password'}
                placeholder={existing ? '••••••••••••••••••' : 'paste secret'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 font-mono text-sm pr-16"
              />
              <button type="button" onClick={() => setShowSecret(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center text-slate-500 hover:text-slate-800" title={showSecret ? 'Hide' : 'Show'}>
                {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox" checked={testMode}
              onChange={e => setTestMode(e.target.checked)}
              className="size-4 rounded border-slate-300 accent-brand-600"
            />
            <span>Test mode (use <code className="font-mono text-xs">rzp_test_…</code> keys)</span>
          </label>

          <div className="flex items-center gap-2">
            {savedNote && <span className="text-xs font-semibold text-emerald-700">{savedNote}</span>}
            {err && <span className="text-xs font-semibold text-rose-700">{err}</span>}
            <button
              onClick={save}
              disabled={saving || !keyId}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              <RefreshCcw className={cls('size-3.5', saving && 'animate-spin')} />
              {saving ? 'Saving…' : existing?.key_id ? 'Update' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
