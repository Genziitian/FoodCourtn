import { useCallback, useEffect, useState } from 'react';
import {
  Bell, Building2, ChefHat, Clock, CreditCard, IndianRupee, Image as ImageIcon, Palette, Plus, Save,
  Shield, Smartphone, Wallet, Check, RefreshCcw,
} from 'lucide-react';
import type { PaymentProvider, RestaurantSettings } from '@foodcourt/shared';
import { cls } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Toggle } from '../components/Toggle';
import { useTenant } from '../lib/tenant';
import {
  getBranchSettings, updateBranch, listPaymentGateways, upsertPaymentGateway, updatePaymentGateway,
  listPaymentProviders,
  type PaymentGatewayRow, type PaymentProviderRow,
} from '../lib/api';

type TabKey =
  | 'profile' | 'branding' | 'tax' | 'kot' | 'hours'
  | 'payments' | 'loyalty' | 'notifications';

const TABS: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: 'profile',       label: 'Restaurant profile', icon: Building2 },
  { key: 'branding',      label: 'Branding & theme',   icon: Palette },
  { key: 'tax',           label: 'Tax & Charges',      icon: IndianRupee },
  { key: 'kot',           label: 'Orders & KOT',       icon: ChefHat },
  { key: 'hours',         label: 'Business hours',     icon: Clock },
  { key: 'payments',      label: 'Payments',           icon: CreditCard },
  { key: 'loyalty',       label: 'Loyalty',            icon: Shield },
  { key: 'notifications', label: 'Notifications',      icon: Bell },
];

interface FormState {
  // restaurant row
  name: string;
  slug: string;
  branch_code: string;
  phone: string;
  address: string;
  city: string;
  area_name: string;
  is_open: boolean;
  welcome_text: string;
  hero_image: string;            // legacy single image, kept for back-compat fallback
  hero_images: string[];         // Landing page carousel (welcome screen)
  menu_hero_images: string[];    // Menu page header carousel (food close-ups)
  // settings jsonb
  settings: RestaurantSettings & {
    open_at?: string;
    close_at?: string;
    hours_weekly?: Array<{ day: WeekDay; is_open: boolean; open: string; close: string }>;
    notify_new_order_sound?: boolean;
    notify_payment_failed?: boolean;
    reprint_kot_allowed?: boolean;
  };
}

type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const DAYS: Array<{ key: WeekDay; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

function defaultWeeklyHours() {
  return DAYS.map(d => ({ day: d.key, is_open: true, open: '09:00', close: d.key === 'sat' || d.key === 'sun' ? '23:30' : '23:00' }));
}

const DEFAULT_SETTINGS: FormState['settings'] = {
  gst_percent: 5,
  gst_inclusive: false,
  service_charge_percent: 0,
  packing_charge: 0,
  payment_mode: 'counter',
  auto_accept_orders: true,
  auto_print_kot: true,
  loyalty_earn_rate: 5,
  loyalty_max_redeem_percent: 10,
  apply_taxes_and_charges: true,
  open_at: '09:00',
  close_at: '23:00',
  hours_weekly: defaultWeeklyHours(),
  notify_new_order_sound: true,
  notify_payment_failed: true,
  reprint_kot_allowed: true,
};

export default function Settings() {
  const { branch } = useTenant();
  const [active, setActive] = useState<TabKey>('profile');
  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branch) { setForm(null); return; }
    try {
      const res = await getBranchSettings(branch.id);
      if (!res) return;
      const r = res.restaurant;
      setForm({
        name: r.name ?? '',
        slug: r.slug ?? '',
        branch_code: r.branch_code ?? '',
        phone: r.phone ?? '',
        address: r.address ?? '',
        city: r.city ?? '',
        area_name: r.area_name ?? '',
        is_open: !!r.is_open,
        welcome_text: r.welcome_text ?? '',
        hero_image: r.hero_image ?? '',
        hero_images: Array.isArray(r.hero_images) ? r.hero_images : [],
        menu_hero_images: Array.isArray(r.menu_hero_images) ? r.menu_hero_images : [],
        settings: { ...DEFAULT_SETTINGS, ...(res.settings ?? {}) },
      });
      setDirty(false);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load settings');
    }
  }, [branch]);

  useEffect(() => { load(); }, [load]);

  const setS = <K extends keyof FormState['settings']>(k: K, v: FormState['settings'][K]) => {
    setForm(f => f ? { ...f, settings: { ...f.settings, [k]: v } } : f);
    setDirty(true);
  };
  const setR = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => f ? { ...f, [k]: v } : f);
    setDirty(true);
  };

  const save = async () => {
    if (!branch || !form) return;
    setSaving(true); setError(null);
    try {
      // Clean each hero list: trim, drop empty rows, cap at 5. First valid
      // URL of the LANDING set is mirrored into hero_image so any legacy
      // code paths still render.
      const cleanLanding = form.hero_images.map(s => s.trim()).filter(Boolean).slice(0, 5);
      const cleanMenu    = form.menu_hero_images.map(s => s.trim()).filter(Boolean).slice(0, 5);
      await updateBranch(branch.id, {
        name: form.name,
        slug: form.slug,
        branch_code: form.branch_code,
        phone: form.phone,
        address: form.address,
        city: form.city,
        area_name: form.area_name,
        is_open: form.is_open,
        welcome_text: form.welcome_text || null,
        hero_image: cleanLanding[0] ?? (form.hero_image.trim() || null),
        hero_images: cleanLanding,
        menu_hero_images: cleanMenu,
        settings: form.settings,
      } as any);
      setDirty(false);
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle={branch ? `${branch.name} · operational + brand configuration` : 'Pick a branch'}
        actions={
          <button
            onClick={save}
            disabled={!dirty || saving || !form}
            className={cls(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
              dirty ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            )}
          >
            <Save className="size-4" /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'All saved'}
          </button>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}
      {!branch && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Pick a single branch in the sidebar to manage its settings.
        </div>
      )}

      {form && branch && (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          <nav className="bg-white rounded-2xl shadow-card overflow-hidden h-fit">
            <ul className="py-2">
              {TABS.map(t => (
                <li key={t.key}>
                  <button
                    onClick={() => setActive(t.key)}
                    className={cls(
                      'w-full text-left flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition',
                      active === t.key
                        ? 'bg-brand-50 text-brand-700 border-l-2 border-brand-600'
                        : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <t.icon className="size-4" />
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-6">
            {active === 'profile'       && <ProfilePanel form={form} setR={setR} />}
            {active === 'branding'      && <BrandingPanel form={form} setR={setR} branchSlug={branch.slug} />}
            {active === 'tax'           && <TaxPanel form={form} setS={setS} />}
            {active === 'kot'           && <KotPanel form={form} setS={setS} />}
            {active === 'hours'         && <HoursPanel form={form} setS={setS} setR={setR} />}
            {active === 'payments'      && <PaymentsPanel branchId={branch.id} />}
            {active === 'loyalty'       && <LoyaltyPanel form={form} setS={setS} />}
            {active === 'notifications' && <NotificationsPanel form={form} setS={setS} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-card p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-900 mb-1">{label}</span>
      {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cls(
        'w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition',
        props.className,
      )}
    />
  );
}

interface SetR { <K extends keyof FormState>(k: K, v: FormState[K]): void }
interface SetS { <K extends keyof FormState['settings']>(k: K, v: FormState['settings'][K]): void }

function ProfilePanel({ form, setR }: { form: FormState; setR: SetR }) {
  return (
    <Panel title="Restaurant profile" subtitle="Customer-facing details. Synced to menu hero and receipts.">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Branch name"><Input value={form.name} onChange={e => setR('name', e.target.value)} /></Field>
        <Field label="Branch code"><Input value={form.branch_code} onChange={e => setR('branch_code', e.target.value)} /></Field>
        <Field label="Slug" hint="Customer URL: foodcourt.app/{slug}"><Input value={form.slug} onChange={e => setR('slug', e.target.value)} /></Field>
        <Field label="Contact phone"><Input value={form.phone} onChange={e => setR('phone', e.target.value)} /></Field>
        <Field label="City"><Input value={form.city} onChange={e => setR('city', e.target.value)} /></Field>
        <Field label="Area / locality"><Input value={form.area_name} onChange={e => setR('area_name', e.target.value)} /></Field>
      </div>
      <Field label="Address">
        <textarea
          value={form.address}
          onChange={e => setR('address', e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 resize-none"
        />
      </Field>
      <Toggle checked={form.is_open} onChange={v => setR('is_open', v)} label="Branch is open" description="When off, customers cannot place new orders." />
    </Panel>
  );
}

/**
 * Reusable URL-list editor used for both the Landing carousel and the Menu
 * header carousel. Up to 5 slots, with a live thumbnail beside each row.
 */
function HeroImagesEditor({
  title, subtitle, values, onChange,
}: {
  title: string;
  subtitle: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const setAt = (i: number, v: string) => {
    const next = [...values]; next[i] = v; onChange(next);
  };
  const addSlot = () => {
    if (values.length >= 5) return;
    onChange([...values, '']);
  };
  const removeAt = (i: number) => onChange(values.filter((_, k) => k !== i));

  const slots = values.length === 0 ? [''] : values;

  return (
    <Panel title={title} subtitle={subtitle}>
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 flex items-start gap-3">
        <ImageIcon className="size-4 mt-0.5 shrink-0" />
        <p>Paste public image URLs (Unsplash, Cloudinary, Supabase Storage, etc.). Recommended size <strong>1600×900</strong>. Up to 5 images.</p>
      </div>

      <div className="space-y-2">
        {slots.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded text-[11px] font-bold bg-slate-200 text-slate-700">
                {i + 1}
              </span>
              <Input
                value={url}
                onChange={e => setAt(i, e.target.value)}
                placeholder="https://images.example.com/hero.jpg"
                className="pl-10 font-mono text-xs"
              />
            </div>
            {url && /^https?:\/\//i.test(url.trim()) ? (
              <img
                src={url}
                alt={`Slide ${i + 1} preview`}
                className="size-14 rounded-lg object-cover border border-slate-200 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span className="size-14 rounded-lg border border-dashed border-slate-300 grid place-items-center text-slate-400 text-xs shrink-0">
                preview
              </span>
            )}
            {(values.length > 1 || (values.length === 1 && values[0])) && (
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="size-9 grid place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                title="Remove this image"
                aria-label="Remove"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-slate-500">
          {values.length}/5 slots used · changes apply after you click <strong>Save changes</strong>.
        </p>
        <button
          type="button"
          onClick={addSlot}
          disabled={values.length >= 5}
          className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="size-3.5" /> Add slot
        </button>
      </div>
    </Panel>
  );
}

function BrandingPanel({
  form, setR, branchSlug,
}: { form: FormState; setR: SetR; branchSlug: string }) {
  const customerUrl = (import.meta.env.VITE_CUSTOMER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8081';

  return (
    <div className="space-y-6">
      <HeroImagesEditor
        title="Landing page images"
        subtitle="Full-screen carousel on the welcome page (the first screen after scanning a QR code). Wide cinematic shots work best. The first image is also used as the legacy single hero. Auto-rotates every 4.5s."
        values={form.hero_images}
        onChange={(next) => setR('hero_images', next)}
      />

      <HeroImagesEditor
        title="Menu page images"
        subtitle="Carousel inside the menu page header. Food close-ups and dish photos work best here. Leave empty to reuse your Landing page images."
        values={form.menu_hero_images}
        onChange={(next) => setR('menu_hero_images', next)}
      />

      <Panel
        title="Welcome text"
        subtitle="Shown under the restaurant name on the customer landing page. Keep it short — about one line."
      >
        <Field label="Welcome message">
          <textarea
            value={form.welcome_text}
            onChange={e => setR('welcome_text', e.target.value)}
            rows={2}
            maxLength={160}
            placeholder="Your table is ready. Browse the menu and start ordering."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 resize-none"
          />
          <p className="mt-1 text-xs text-slate-500">{form.welcome_text.length}/160 characters</p>
        </Field>
      </Panel>

      <Panel
        title="Where these appear"
        subtitle="Open the customer site to see your changes live after saving."
      >
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">Restaurant landing page</p>
              <p className="text-xs text-slate-500 truncate">Hero carousel + welcome text</p>
            </div>
            <a href={`${customerUrl}/${branchSlug}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-600 hover:underline shrink-0">
              Open ↗
            </a>
          </li>
          <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">Menu page header</p>
              <p className="text-xs text-slate-500 truncate">Same carousel, compact strip</p>
            </div>
            <a href={`${customerUrl}/${branchSlug}/menu`} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-600 hover:underline shrink-0">
              Open ↗
            </a>
          </li>
          <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">Customer login / OTP page</p>
              <p className="text-xs text-slate-500 truncate">Falls back to platform defaults if no images set here</p>
            </div>
            <a href={`${customerUrl}/login`} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-600 hover:underline shrink-0">
              Open ↗
            </a>
          </li>
        </ul>
      </Panel>

      <Panel
        title="Brand colours & logo"
        subtitle="Set at the organization level (every branch in the org inherits them)."
      >
        <p className="text-sm text-slate-500">
          Brand colour and logo live on the organization. A super admin can update them via Super Admin → Restaurants → ⋯ → manage organization.
        </p>
      </Panel>
    </div>
  );
}

function TaxPanel({ form, setS }: { form: FormState; setS: SetS }) {
  const applyTaxes = form.settings.apply_taxes_and_charges !== false;
  return (
    <Panel title="Tax & Charges" subtitle="GST, service charge, parcel fees applied to every order.">
      {/* Master toggle: when off, GST + service charge are not added to the bill
          and the customer doesn't see the "Taxes & Service Charge" line at all.
          Parcel charge on takeaway is unaffected — it's a separate line item. */}
      <Toggle
        checked={applyTaxes}
        onChange={v => setS('apply_taxes_and_charges', v)}
        label="Apply taxes & service charge"
        description="When off, the customer bill skips the Tax + Service line entirely. Parcel charge on takeaway is independent and always included."
      />

      <div className={cls('grid grid-cols-2 gap-4 transition', !applyTaxes && 'opacity-50 pointer-events-none')}>
        <Field label="GST percentage">
          <div className="relative">
            <Input type="number" value={form.settings.gst_percent} onChange={e => setS('gst_percent', Number(e.target.value))} className="pr-10" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
          </div>
        </Field>
        <Field label="Service charge percentage">
          <div className="relative">
            <Input type="number" value={form.settings.service_charge_percent} onChange={e => setS('service_charge_percent', Number(e.target.value))} className="pr-10" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
          </div>
        </Field>
      </div>

      <Field label="Parcel charge" hint="Automatically added to every Takeaway order. Shown as its own line on the customer bill. Set to 0 to disable.">
        <div className="relative max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
          <Input type="number" value={form.settings.packing_charge} onChange={e => setS('packing_charge', Number(e.target.value))} className="pl-7" />
        </div>
      </Field>

      <div className={cls('transition', !applyTaxes && 'opacity-50 pointer-events-none')}>
        <Toggle
          checked={form.settings.gst_inclusive}
          onChange={v => setS('gst_inclusive', v)}
          label="GST inclusive pricing"
          description="If on, item prices already include GST; no tax line shown to customer."
        />
      </div>
    </Panel>
  );
}

function KotPanel({ form, setS }: { form: FormState; setS: SetS }) {
  return (
    <Panel title="Orders & KOT" subtitle="Operational behavior that drives the kitchen pipeline.">
      <Toggle checked={form.settings.auto_accept_orders}  onChange={v => setS('auto_accept_orders', v)}  label="Auto-accept new orders"      description="When off, orders sit in 'Received' until a manager confirms." />
      <Toggle checked={form.settings.auto_print_kot}      onChange={v => setS('auto_print_kot', v)}      label="Auto-print KOT on order placement" description="Sends to thermal printer the moment an order arrives." />
      <Toggle checked={form.settings.reprint_kot_allowed ?? true} onChange={v => setS('reprint_kot_allowed', v)} label="Allow KOT reprints"          description="If a paper jam happens, staff can reprint from Orders." />
    </Panel>
  );
}

function HoursPanel({ form, setS, setR: _setR }: { form: FormState; setS: SetS; setR: SetR }) {
  void _setR;
  const weekly = form.settings.hours_weekly ?? defaultWeeklyHours();

  const update = (day: WeekDay, patch: Partial<{ is_open: boolean; open: string; close: string }>) => {
    const next = weekly.map(d => d.day === day ? { ...d, ...patch } : d);
    setS('hours_weekly', next);
  };

  const copyToAll = (day: WeekDay) => {
    const src = weekly.find(d => d.day === day);
    if (!src) return;
    const next = weekly.map(d => ({ ...d, is_open: src.is_open, open: src.open, close: src.close }));
    setS('hours_weekly', next);
  };

  return (
    <Panel title="Business hours" subtitle="Per-weekday open / close times. Customer app shows 'Closed' outside these.">
      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const d = weekly.find(x => x.day === key) ?? { day: key, is_open: true, open: '09:00', close: '23:00' };
          return (
            <div key={key} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
              <label className="inline-flex items-center gap-2 w-32 shrink-0 cursor-pointer">
                <input
                  type="checkbox" checked={d.is_open}
                  onChange={e => update(key, { is_open: e.target.checked })}
                  className="size-4 rounded border-slate-300 accent-brand-600"
                />
                <span className="text-sm font-semibold text-slate-700">{label}</span>
              </label>
              {d.is_open ? (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Opens</span>
                    <Input type="time" value={d.open} onChange={e => update(key, { open: e.target.value })} className="w-28" />
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500">Closes</span>
                    <Input type="time" value={d.close} onChange={e => update(key, { close: e.target.value })} className="w-28" />
                  </div>
                  <button
                    onClick={() => copyToAll(key)}
                    className="ml-auto text-xs font-semibold text-brand-600 hover:bg-brand-50 px-2 py-1 rounded"
                    title="Copy this day's hours to every other day"
                  >
                    Copy to all
                  </button>
                </>
              ) : (
                <span className="text-sm text-slate-500 italic">Closed</span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

const PROVIDER_META: Record<PaymentProvider, { name: string; icon: any; color: string; tagline: string }> = {
  razorpay: { name: 'Razorpay', icon: CreditCard, color: 'bg-blue-100 text-blue-700',     tagline: 'UPI, Cards, Netbanking, Wallets' },
  stripe:   { name: 'Stripe',   icon: CreditCard, color: 'bg-purple-100 text-purple-700', tagline: 'International cards' },
  phonepe:  { name: 'PhonePe',  icon: Smartphone, color: 'bg-indigo-100 text-indigo-700', tagline: 'UPI-first, PhonePe wallet' },
  paytm:    { name: 'Paytm',    icon: Wallet,     color: 'bg-sky-100 text-sky-700',       tagline: 'Wallets, UPI' },
  cashfree: { name: 'Cashfree', icon: CreditCard, color: 'bg-emerald-100 text-emerald-700', tagline: 'UPI, Cards, Payouts' },
};

function PaymentsPanel({ branchId }: { branchId: string }) {
  const [providers, setProviders] = useState<PaymentProviderRow[]>([]);
  const [gateways, setGateways] = useState<PaymentGatewayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [pp, gs] = await Promise.all([
        listPaymentProviders(),
        listPaymentGateways([branchId]),
      ]);
      setProviders(pp);
      setGateways(gs);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load payment settings');
    } finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { refresh(); }, [refresh]);

  const setActive = async (g: PaymentGatewayRow, v: boolean) => {
    setGateways(gs => gs.map(x => x.id === g.id ? { ...x, is_active: v } : x));
    try { await updatePaymentGateway(g.id, { is_active: v }); }
    catch (e) { console.error(e); refresh(); }
  };

  // Only show providers the super admin has enabled platform-wide.
  const enabledProviders = providers.filter(p => p.is_enabled);

  return (
    <Panel title="Payment gateways" subtitle="Each branch has its own keys. Settlements go directly to your linked account.">
      <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 text-sm text-brand-900">
        <p className="font-semibold mb-1">We never touch your money</p>
        <p>Payments flow: customer → your Razorpay account → your bank. We only verify the webhook signature on our side.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}
      {loading && <p className="text-sm text-slate-500">Loading gateways…</p>}

      {!loading && enabledProviders.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          No payment providers are enabled by the platform yet. Ask a super admin to enable Razorpay under <strong>Super → Payment Integrations</strong>.
        </div>
      )}

      <div className="space-y-3">
        {enabledProviders.map(p => {
          const existing = gateways.find(g => g.provider === p.provider);
          const meta = PROVIDER_META[p.provider];
          const Icon = meta?.icon ?? CreditCard;
          return (
            <GatewayCard
              key={p.provider}
              provider={p}
              icon={Icon}
              iconColor={meta?.color ?? 'bg-slate-100 text-slate-600'}
              existing={existing}
              branchId={branchId}
              onActiveChange={(g, v) => setActive(g, v)}
              onSaved={refresh}
            />
          );
        })}
      </div>

      <div>
        <p className="text-sm font-semibold mb-2">Accepted methods (Razorpay auto-detects)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {['UPI', 'Cards', 'Wallets', 'Netbanking'].map(m => (
            <div key={m} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium flex items-center justify-between">
              {m}
              <Check className="size-3.5 text-emerald-500" />
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function GatewayCard({
  provider, icon: Icon, iconColor, existing, branchId, onActiveChange, onSaved,
}: {
  provider: PaymentProviderRow;
  icon: any;
  iconColor: string;
  existing: PaymentGatewayRow | undefined;
  branchId: string;
  onActiveChange: (g: PaymentGatewayRow, v: boolean) => void;
  onSaved: () => void;
}) {
  const [keyId, setKeyId] = useState(existing?.key_id ?? '');
  const [secret, setSecret] = useState('');
  const [testMode, setTestMode] = useState(existing?.test_mode ?? true);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Sync local form when existing changes (e.g., after refresh from server)
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
      setSavedNote(existing ? 'Updated' : 'Connected. Customer checkout will now use this key.');
      onSaved();
    } catch (e: any) {
      setErr(e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-4 flex items-center gap-4">
        <span className={cls('size-10 grid place-items-center rounded-lg', iconColor)}>
          <Icon className="size-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{provider.display_name}</p>
            {existing?.is_active && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Connected</span>
            )}
            {existing?.test_mode && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Test mode</span>
            )}
          </div>
          <p className="text-xs text-slate-500">{provider.tagline ?? ''}</p>
        </div>
        {existing && (
          <Toggle checked={existing.is_active} onChange={v => onActiveChange(existing, v)} />
        )}
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Key ID" hint={existing ? 'Stored — paste again to update' : 'rzp_test_… or rzp_live_…'}>
            <Input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="rzp_test_xxxxxxxxxxxxx" className="font-mono" />
          </Field>
          <Field label="Secret key" hint={existing?.is_active ? 'Stored — leave blank to keep current' : 'Generated in your Razorpay dashboard'}>
            <div className="relative">
              <Input
                value={secret}
                onChange={e => setSecret(e.target.value)}
                type={showSecret ? 'text' : 'password'}
                placeholder={existing ? '••••••••••••••••••' : 'paste secret'}
                className="font-mono pr-12"
              />
              <button
                type="button"
                onClick={() => setShowSecret(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1"
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={testMode}
              onChange={e => setTestMode(e.target.checked)}
              className="size-4 rounded border-slate-300 accent-brand-600"
            />
            <span>Test mode (use <code className="font-mono text-xs">rzp_test_…</code> keys for sandbox payments)</span>
          </label>
          <div className="flex items-center gap-2">
            {savedNote && <span className="text-xs font-semibold text-emerald-700">{savedNote}</span>}
            {err && <span className="text-xs font-semibold text-rose-700">{err}</span>}
            <button
              onClick={save}
              disabled={saving || !keyId}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              <RefreshCcw className={cls('size-4', saving && 'animate-spin')} />
              {saving ? 'Saving…' : existing ? 'Update keys' : 'Connect Razorpay'}
            </button>
          </div>
        </div>

        {existing && (
          <p className="text-[11px] text-slate-500">
            Webhook URL (paste into your Razorpay dashboard): <code className="font-mono">https://api.foodcourt.app/webhooks/{provider.provider}</code>
          </p>
        )}
      </div>
    </div>
  );
}

function LoyaltyPanel({ form, setS }: { form: FormState; setS: SetS }) {
  return (
    <Panel title="Loyalty program" subtitle="Points earned per spend and redemption rules.">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Earn rate" hint="Points earned per ₹100 spent.">
          <div className="relative">
            <Input type="number" value={form.settings.loyalty_earn_rate} onChange={e => setS('loyalty_earn_rate', Number(e.target.value))} className="pr-24" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">pts / ₹100</span>
          </div>
        </Field>
        <Field label="Max redeem" hint="Cap on how much of an order can be paid via points.">
          <div className="relative">
            <Input type="number" value={form.settings.loyalty_max_redeem_percent} onChange={e => setS('loyalty_max_redeem_percent', Number(e.target.value))} className="pr-10" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
          </div>
        </Field>
      </div>
    </Panel>
  );
}

function NotificationsPanel({ form, setS }: { form: FormState; setS: SetS }) {
  return (
    <Panel title="Notifications" subtitle="What gets your attention in real time.">
      <Toggle checked={form.settings.notify_new_order_sound ?? true} onChange={v => setS('notify_new_order_sound', v)} label="Sound alert on new orders"  description="Plays a chime when an order arrives in the dashboard." />
      <Toggle checked={form.settings.notify_payment_failed ?? true}  onChange={v => setS('notify_payment_failed', v)}  label="Alert on failed payments"   description="Critical — failed UPI can leave a customer waiting at the table." />
    </Panel>
  );
}
