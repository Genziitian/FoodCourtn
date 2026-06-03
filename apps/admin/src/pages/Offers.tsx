import { useCallback, useEffect, useState } from 'react';
import {
  Calendar, ChevronRight, Clock, Gift, Percent, Plus, Tag, TrendingUp, Trash2,
} from 'lucide-react';
import type { CouponType } from '@foodcourt/shared';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Drawer';
import { Toggle } from '../components/Toggle';
import { useTenant } from '../lib/tenant';
import {
  listCoupons, createCoupon, setCouponActive, deleteCoupon,
  type CouponRow,
} from '../lib/api';

const ALL_TYPES = [
  { key: 'percent',    label: 'Percent off',  icon: Percent,  desc: 'e.g. 20% off, max ₹100' },
  { key: 'flat',       label: 'Flat off',     icon: Tag,      desc: 'e.g. ₹50 off above ₹200' },
  { key: 'bogo',       label: 'BOGO',         icon: Gift,     desc: 'Buy 1 Get 1 Free' },
  { key: 'free_item',  label: 'Free item',    icon: Gift,     desc: 'Free brownie above ₹799' },
] as const;

export default function Offers() {
  const { branch, scopedRestaurantIds } = useTenant();
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await listCoupons(scopedRestaurantIds)); }
    catch (e: any) { setError(e.message ?? 'Failed to load offers'); }
    finally { setLoading(false); }
  }, [scopedRestaurantIds]);

  useEffect(() => { refresh(); }, [refresh]);

  // Approximate redemption stats from `used_count` and discount value.
  const totalRedemptions = rows.reduce((s, c) => s + (c.used_count ?? 0), 0);
  const totalDiscount = rows.reduce((s, c) => {
    const v = c.type === 'percent' ? (c.max_discount ?? 0) : (c.value ?? 0);
    return s + (c.used_count ?? 0) * v;
  }, 0);
  const active = rows.filter(c => c.is_active).length;

  const toggleActive = async (c: CouponRow) => {
    setRows(rs => rs.map(r => r.id === c.id ? { ...r, is_active: !r.is_active } : r));
    try { await setCouponActive(c.id, !c.is_active); }
    catch (e) { console.error(e); refresh(); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this coupon?')) return;
    const prev = rows;
    setRows(rs => rs.filter(r => r.id !== id));
    try { await deleteCoupon(id); }
    catch (e: any) { alert(e.message); setRows(prev); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offers & Coupons"
        subtitle={loading ? 'Loading…' : `${active} active campaigns · ${totalRedemptions} redemptions · ${inr(totalDiscount)} estimated discount`}
        actions={
          <button
            onClick={() => setCreating(true)}
            disabled={!branch}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="size-4" /> Create offer
          </button>
        }
      />

      {!branch && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Pick a single branch in the sidebar to create coupons for it.
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatTile icon={Tag}        iconBg="bg-brand-50 text-brand-700"  label="Active campaigns"      value={String(active)} sub={`of ${rows.length} total`} />
        <StatTile icon={TrendingUp} iconBg="bg-blue-50 text-blue-700"    label="Redemptions"           value={String(totalRedemptions)} sub="Lifetime" />
        <StatTile icon={Gift}       iconBg="bg-emerald-50 text-emerald-700" label="Discount given"     value={inr(totalDiscount)} sub="Estimated" />
      </div>

      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Coupons</h2>
            <p className="text-sm text-slate-500">Toggle to activate / pause campaigns</p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3 text-right">Used</th>
                <th className="px-6 py-3 text-right">Min order</th>
                <th className="px-6 py-3 text-center">Active</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center gap-2 font-mono font-bold text-brand-700 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-md">
                      <Tag className="size-3.5" />
                      {c.code}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-700">{c.description ?? '—'}</td>
                  <td className="px-6 py-3 text-right font-semibold">{c.used_count}</td>
                  <td className="px-6 py-3 text-right text-slate-600">{c.min_order_value ? inr(c.min_order_value) : '—'}</td>
                  <td className="px-6 py-3">
                    <div className="grid place-items-center">
                      <Toggle checked={c.is_active} onChange={() => toggleActive(c)} />
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => remove(c.id)}
                      className="size-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-600"
                      title="Delete"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <p className="text-center text-slate-500 py-12">No coupons yet. Create your first offer.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold mb-3">Offer types</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => branch && setCreating(true)}
              className="text-left bg-white rounded-2xl shadow-card p-5 hover:shadow-cardHover transition flex items-start gap-3"
            >
              <span className="size-10 grid place-items-center rounded-lg bg-brand-50 text-brand-700 shrink-0">
                <t.icon className="size-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
              </div>
              <ChevronRight className="size-4 text-slate-400" />
            </button>
          ))}
        </div>
      </section>

      {branch && (
        <CreateCouponModal
          open={creating}
          restaurantId={branch.id}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

function StatTile({
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

function CreateCouponModal({
  open, restaurantId, onClose, onCreated,
}: {
  open: boolean;
  restaurantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<CouponType>('percent');
  const [code, setCode] = useState('');
  const [value, setValue] = useState(20);
  const [minOrder, setMinOrder] = useState(0);
  const [maxDiscount, setMaxDiscount] = useState(100);
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!code) return;
    setSaving(true); setErr(null);
    const description =
      type === 'percent' ? `${value}% off${maxDiscount ? ` (max ${inr(maxDiscount)})` : ''}`
      : type === 'flat' ? `Flat ${inr(value)} off${minOrder ? ` above ${inr(minOrder)}` : ''}`
      : type === 'bogo' ? 'Buy 1 Get 1 Free'
      : `Free item above ${inr(minOrder || 799)}`;

    try {
      await createCoupon({
        restaurant_id: restaurantId,
        code: code.toUpperCase(),
        description,
        type,
        value: type === 'bogo' || type === 'free_item' ? null : value,
        min_order_value: minOrder,
        max_discount: type === 'percent' ? maxDiscount : null,
        valid_from: validFrom ? new Date(validFrom).toISOString() : null,
        valid_to: validTo ? new Date(validTo).toISOString() : null,
      });
      setCode(''); setValue(20); setMinOrder(0); setMaxDiscount(100); setValidFrom(''); setValidTo('');
      onCreated();
    } catch (e: any) {
      setErr(e.message ?? 'Could not create coupon');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create offer"
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white rounded-full">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!code || saving}
            className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Create offer'}
          </button>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">Type</p>
          <div className="grid grid-cols-3 gap-2">
            {ALL_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setType(t.key as CouponType)}
                className={cls(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition text-left',
                  type === t.key
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300',
                )}
              >
                <t.icon className="size-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Code" required>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME50"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 font-mono uppercase"
          />
        </Field>

        {type === 'percent' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Percentage off">
              <input type="number" value={value} onChange={e => setValue(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
            </Field>
            <Field label="Max discount (₹)">
              <input type="number" value={maxDiscount} onChange={e => setMaxDiscount(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
            </Field>
          </div>
        )}

        {type === 'flat' && (
          <Field label="Flat amount (₹)">
            <input type="number" value={value} onChange={e => setValue(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
          </Field>
        )}

        <Field label="Minimum order value (₹)">
          <input type="number" value={minOrder} onChange={e => setMinOrder(Number(e.target.value))} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Valid from"><div className="relative">
            <Calendar className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500" />
          </div></Field>
          <Field label="Valid to"><div className="relative">
            <Calendar className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="date" value={validTo} onChange={e => setValidTo(e.target.value)} className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500" />
          </div></Field>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

void Clock;
