import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3, Building2, ChevronDown, ChevronRight, ExternalLink, MapPin, MoreHorizontal,
  Phone, Plus, Search, ShoppingBag, TrendingUp, Users as UsersIcon, Wallet,
} from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Drawer';
import {
  listOrganizations, listBranches, createBranch, getRevenueByOrg,
  seedNewBranch, createOrgWithOwner, addOrgAdminToExisting,
  listOrgAdmins, removeOrgAdmin, isValidEmail, getOrgInsights,
  type OrgRow, type BranchRow, type OrgAdminRow, type OrgInsights,
} from '../../lib/api';

export default function SuperRestaurants() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [revByOrg, setRevByOrg] = useState<Map<string, { revenue_today: number; orders_today: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [creatingBranchFor, setCreatingBranchFor] = useState<string | null>(null);
  const [managingAdminsFor, setManagingAdminsFor] = useState<OrgRow | null>(null);
  const [viewingInsightsFor, setViewingInsightsFor] = useState<OrgRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [os, bs, rev] = await Promise.all([
        listOrganizations(), listBranches(), getRevenueByOrg(),
      ]);
      setOrgs(os);
      setBranches(bs);
      const m = new Map<string, { revenue_today: number; orders_today: number }>();
      rev.forEach(r => m.set(r.org_id, { revenue_today: r.revenue_today, orders_today: r.orders_today }));
      setRevByOrg(m);
      // auto-expand first org
      if (os.length && expanded.size === 0) setExpanded(new Set([os[0].id]));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const orgsFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(o => {
      if (o.name.toLowerCase().includes(q)) return true;
      return branches.some(b => b.organization_id === o.id && ((b.name?.toLowerCase().includes(q)) || (b.city?.toLowerCase().includes(q)) || (b.area_name?.toLowerCase().includes(q))));
    });
  }, [orgs, branches, query]);

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Restaurants"
        subtitle={loading ? 'Loading…' : `${orgs.length} organizations · ${branches.length} branches across the platform`}
        actions={
          <button
            onClick={() => setCreatingOrg(true)}
            className="inline-flex items-center gap-2 rounded-full bg-purple-600 text-white px-4 py-2 text-sm font-semibold hover:bg-purple-700"
          >
            <Plus className="size-4" /> New organization
          </button>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by org name, branch, city..."
              className="w-full rounded-full bg-slate-100 pl-10 pr-4 py-2 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-purple-500/20"
            />
          </div>
        </header>

        <ul className="divide-y divide-slate-100">
          {orgsFiltered.map(o => {
            const orgBranches = branches.filter(b => b.organization_id === o.id);
            const rev = revByOrg.get(o.id) ?? { revenue_today: 0, orders_today: 0 };
            const isExpanded = expanded.has(o.id);
            return (
              <li key={o.id}>
                <div
                  onClick={() => toggle(o.id)}
                  className="px-6 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50"
                >
                  <ChevronDown className={cls('size-4 text-slate-400 transition', !isExpanded && '-rotate-90')} />
                  <span
                    className="size-12 grid place-items-center rounded-xl text-white font-bold shrink-0"
                    style={{ background: o.brand_color }}
                  >
                    {o.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg">{o.name}</p>
                      <span className={cls(
                        'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                        o.plan === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                        o.plan === 'growth' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600',
                      )}>{o.plan}</span>
                      {!o.is_active && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {orgBranches.length} branch{orgBranches.length === 1 ? '' : 'es'} · {o.commission_percent}% commission{o.contact_phone ? ` · ${o.contact_phone}` : ''}
                    </p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-slate-500">Today</p>
                    <p className="font-bold">{inr(rev.revenue_today)}</p>
                    <p className="text-xs text-slate-500">{rev.orders_today} orders</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setManagingAdminsFor(o); }}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-200"
                    title="Manage org admin accounts"
                  >
                    <UsersIcon className="size-3.5" />
                    Admins
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setCreatingBranchFor(o.id); }}
                    className="inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 px-3 py-1.5 text-xs font-semibold hover:bg-purple-100"
                  >
                    <Plus className="size-3.5" />
                    Branch
                  </button>
                  <OrgActionsMenu
                    onViewInsights={() => setViewingInsightsFor(o)}
                    onManageAdmins={() => setManagingAdminsFor(o)}
                    onAddBranch={() => setCreatingBranchFor(o.id)}
                  />
                </div>

                {isExpanded && orgBranches.length > 0 && (
                  <ul className="bg-slate-50/50 border-t border-slate-100">
                    {orgBranches.map(b => (
                      <BranchRowView key={b.id} branch={b} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {!loading && orgsFiltered.length === 0 && (
            <li className="px-6 py-12 text-sm text-center text-slate-500">No organizations match.</li>
          )}
        </ul>
      </div>

      <CreateOrgModal
        open={creatingOrg}
        onClose={() => setCreatingOrg(false)}
        onCreated={() => { setCreatingOrg(false); refresh(); }}
      />
      <CreateBranchModal
        orgId={creatingBranchFor}
        orgs={orgs}
        onClose={() => setCreatingBranchFor(null)}
        onCreated={() => { setCreatingBranchFor(null); refresh(); }}
      />

      <ManageAdminsModal
        org={managingAdminsFor}
        onClose={() => setManagingAdminsFor(null)}
      />

      <OrgInsightsModal
        org={viewingInsightsFor}
        onClose={() => setViewingInsightsFor(null)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Three-dots dropdown menu for an org row
// ────────────────────────────────────────────────────────────
function OrgActionsMenu({
  onViewInsights, onManageAdmins, onAddBranch,
}: {
  onViewInsights: () => void;
  onManageAdmins: () => void;
  onAddBranch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const pick = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={cls(
          'size-8 grid place-items-center rounded-full text-slate-500 transition',
          open ? 'bg-slate-200 text-slate-800' : 'hover:bg-slate-100',
        )}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden text-sm"
        >
          <button
            onClick={pick(onViewInsights)}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 font-medium"
          >
            <BarChart3 className="size-4 text-purple-600" />
            View insights
          </button>
          <button
            onClick={pick(onManageAdmins)}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50"
          >
            <UsersIcon className="size-4 text-slate-500" />
            Manage admins
          </button>
          <button
            onClick={pick(onAddBranch)}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 border-t border-slate-100"
          >
            <Plus className="size-4 text-slate-500" />
            Add branch
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Per-org insights modal — revenue, orders, customers, last activity
// ────────────────────────────────────────────────────────────
function OrgInsightsModal({ org, onClose }: { org: OrgRow | null; onClose: () => void }) {
  const [data, setData] = useState<OrgInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) { setData(null); setError(null); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    getOrgInsights(org.id)
      .then(r => { if (!cancelled) setData(r); })
      .catch(e => { if (!cancelled) setError(e?.message ?? 'Failed to load insights'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [org?.id]);

  if (!org) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Insights · ${org.name}`}
      width="lg"
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">
            Close
          </button>
        </div>
      }
    >
      {loading && (
        <div className="py-12 text-center text-sm text-slate-500">
          <div className="mx-auto size-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <p className="mt-3">Crunching numbers…</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}
      {data && (
        <div className="space-y-5">
          {/* Headline tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <InsightTile icon={Wallet}    label="Revenue · all-time" value={inr(data.revenue_total)} sub={`AOV ${inr(data.aov)}`} accent="emerald" />
            <InsightTile icon={ShoppingBag} label="Orders · all-time" value={String(data.orders_total)} sub={`${data.orders_month} in last 30d`} accent="blue" />
            <InsightTile icon={UsersIcon} label="Unique customers"    value={String(data.customer_count)} sub="Who've placed an order" accent="purple" />
            <InsightTile icon={Building2} label="Branches"            value={`${data.active_branches}/${data.branch_count}`} sub="Active / total" accent="amber" />
          </div>

          {/* Time-windowed revenue */}
          <section>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Revenue over time</h3>
            <div className="grid grid-cols-3 gap-3">
              <SegmentTile label="Today"     revenue={data.revenue_today} orders={data.orders_today} />
              <SegmentTile label="Last 30d"  revenue={data.revenue_month} orders={data.orders_month} />
              <SegmentTile label="All-time"  revenue={data.revenue_total} orders={data.orders_total} />
            </div>
          </section>

          {/* Highlights */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Top branch</p>
              {data.top_branch ? (
                <>
                  <p className="font-bold text-lg mt-1">{data.top_branch.name}</p>
                  <p className="text-sm text-slate-500">{inr(data.top_branch.revenue)} total revenue</p>
                </>
              ) : (
                <p className="text-sm text-slate-500 mt-1">No orders yet.</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Last order</p>
              <p className="font-bold text-lg mt-1">
                {data.last_order_at
                  ? new Date(data.last_order_at).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </p>
              <p className="text-sm text-slate-500">{data.admin_count} admin{data.admin_count === 1 ? '' : 's'} linked</p>
            </div>
          </section>

          {/* Recent orders */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900">Recent orders</h3>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <TrendingUp className="size-3.5" /> Latest 8
              </span>
            </div>
            {data.recent_orders.length === 0 ? (
              <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-sm text-slate-500 text-center">
                No orders yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {data.recent_orders.map(o => (
                  <li key={o.code} className="px-3 py-2.5 flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs font-bold text-slate-700 shrink-0">{o.code}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-500">{o.branch_name}</span>
                    <span className={cls(
                      'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
                      o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      o.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                      'bg-amber-100 text-amber-700',
                    )}>{o.status}</span>
                    <span className="font-bold text-slate-900 w-20 text-right shrink-0">{inr(o.total)}</span>
                    <span className="text-xs text-slate-400 w-16 text-right shrink-0 hidden md:inline">
                      {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function InsightTile({
  icon: Icon, label, value, sub, accent,
}: {
  icon: any; label: string; value: string; sub: string;
  accent: 'emerald' | 'blue' | 'purple' | 'amber';
}) {
  const accents: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue:    'bg-blue-50 text-blue-700',
    purple:  'bg-purple-50 text-purple-700',
    amber:   'bg-amber-50 text-amber-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <span className={cls('size-8 grid place-items-center rounded-lg', accents[accent])}>
          <Icon className="size-4" />
        </span>
        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</p>
      </div>
      <p className="font-extrabold text-2xl mt-2">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
    </div>
  );
}

function SegmentTile({ label, revenue, orders }: { label: string; revenue: number; orders: number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
      <p className="text-xs uppercase tracking-wider font-bold text-slate-500">{label}</p>
      <p className="font-extrabold text-xl mt-1">{inr(revenue)}</p>
      <p className="text-xs text-slate-500">{orders} order{orders === 1 ? '' : 's'}</p>
    </div>
  );
}

function ManageAdminsModal({ org, onClose }: { org: OrgRow | null; onClose: () => void }) {
  const [admins, setAdmins] = useState<OrgAdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const refresh = async () => {
    if (!org) return;
    setLoading(true);
    try { setAdmins(await listOrgAdmins(org.id)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (org) { setErr(null); setSavedNote(null); refresh(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);

  const addAdmin = async () => {
    if (!org || !email || !password) {
      setErr('Email and password are required'); return;
    }
    if (!isValidEmail(email)) {
      setErr('Email looks malformed — use the format name@example.com'); return;
    }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setAdding(true); setErr(null); setSavedNote(null);
    try {
      await addOrgAdminToExisting({
        organization_id: org.id,
        owner: { email, password, display_name: name || undefined },
      });
      setSavedNote(`Owner account created. ${name || email.split('@')[0]} can sign in at /login.`);
      setName(''); setEmail(''); setPassword('');
      await refresh();
    } catch (e: any) {
      setErr(e.message ?? 'Could not add admin');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (a: OrgAdminRow) => {
    if (!org) return;
    if (!confirm(`Remove ${a.display_name ?? a.email ?? 'this admin'}? They lose access to this organization and every branch in it.`)) return;
    try { await removeOrgAdmin(org.id, a.user_id); await refresh(); }
    catch (e: any) { setErr(e.message); }
  };

  if (!org) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Admins · ${org.name}`}
      width="lg"
      footer={
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Close</button>
        </div>
      }
    >
      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-bold text-slate-900 mb-2">Current admins</h3>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : admins.length === 0 ? (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              No admin assigned yet. Add one below — they'll be able to sign in at <code className="font-mono text-xs">/login</code> and manage all branches in this organization.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {admins.map(a => (
                <li key={a.user_id} className="px-3 py-2.5 flex items-center gap-3">
                  <span className="size-8 grid place-items-center rounded-full bg-purple-100 text-purple-700 text-xs font-bold shrink-0">
                    {(a.display_name ?? a.email ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{a.display_name ?? '—'}</p>
                    <p className="text-xs text-slate-500 truncate">{a.email ?? a.user_id.slice(0, 8) + '…'}</p>
                  </div>
                  <span className="text-xs text-slate-500">Added {new Date(a.created_at).toLocaleDateString('en-IN')}</span>
                  <button
                    onClick={() => remove(a)}
                    className="text-xs font-semibold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg"
                    title="Remove admin"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 space-y-3">
          <div>
            <p className="font-semibold text-purple-900">Add a new admin to this organization</p>
            <p className="text-xs text-purple-900/80">
              Creates a fresh account. They'll be linked as owner of every existing branch and any future branch.
            </p>
          </div>
          <Field label="Name">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Owner full name" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" required>
              <Input value={email} onChange={e => setEmail(e.target.value.trim())} type="email" placeholder="owner@brand.com" />
            </Field>
            <Field label="Password" required hint="≥ 6 chars">
              <div className="relative">
                <Input value={password} onChange={e => setPassword(e.target.value)} type={showPwd ? 'text' : 'password'} className="pr-16" />
                <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1">
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </Field>
          </div>
          {err && <p className="text-sm text-rose-700 bg-rose-50 rounded-lg p-2">{err}</p>}
          {savedNote && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg p-2">{savedNote}</p>}
          <div className="flex justify-end">
            <button
              onClick={addAdmin}
              disabled={adding || !email || !password}
              className="inline-flex items-center gap-2 rounded-full bg-purple-600 text-white px-4 py-2 text-sm font-semibold hover:bg-purple-700 disabled:opacity-50"
            >
              {adding ? 'Creating…' : 'Add admin'}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function BranchRowView({ branch }: { branch: BranchRow }) {
  const customerBase = (import.meta.env.VITE_CUSTOMER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8081';
  const customerHref = `${customerBase}/${branch.slug}`;
  return (
    <li className="pl-16 pr-6 py-3 flex items-center gap-3 hover:bg-white border-l-2 border-transparent hover:border-purple-300">
      <span className="size-8 grid place-items-center rounded-md bg-white border border-slate-200 font-mono text-[10px] font-bold text-slate-500 shrink-0">
        {(branch.branch_code ?? branch.slug.split('-').pop() ?? '').slice(-4).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{branch.name}</p>
        <p className="text-xs text-slate-500 inline-flex items-center gap-3 mt-0.5">
          {(branch.area_name || branch.city) && (
            <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {[branch.area_name, branch.city].filter(Boolean).join(', ')}</span>
          )}
          {branch.phone && (
            <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {branch.phone}</span>
          )}
          <span className="inline-flex items-center gap-1"><UsersIcon className="size-3" /> /{branch.slug}</span>
        </p>
      </div>
      <span className={cls(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        branch.is_open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600',
      )}>
        <span className={cls('size-1.5 rounded-full', branch.is_open ? 'bg-emerald-500' : 'bg-slate-400')} />
        {branch.is_open ? 'Live' : 'Paused'}
      </span>
      <a
        href={customerHref}
        target="_blank"
        rel="noreferrer"
        className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500"
        title="Open customer site"
      >
        <ExternalLink className="size-4" />
      </a>
      <button className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500" title="More">
        <ChevronRight className="size-4" />
      </button>
    </li>
  );
}

function CreateOrgModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [flatFee, setFlatFee] = useState(0);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const submit = async () => {
    if (!name || !slug) return;
    if (!ownerEmail || !ownerPassword) {
      setErr('Owner email and password are required'); return;
    }
    if (!isValidEmail(ownerEmail)) {
      setErr('Email looks malformed — use the format name@example.com'); return;
    }
    if (ownerPassword.length < 6) {
      setErr('Password must be at least 6 characters'); return;
    }
    setSaving(true); setErr(null); setSavedNote(null);
    try {
      await createOrgWithOwner({
        org: { slug, name, contact_phone: contactPhone, flat_platform_fee: flatFee },
        owner: { email: ownerEmail, password: ownerPassword, display_name: ownerName || undefined },
      });
      setSavedNote(`Organization created. ${ownerName || ownerEmail.split('@')[0]} can sign in at /login with their email + password.`);
      setName(''); setSlug(''); setContactPhone(''); setFlatFee(0);
      setOwnerName(''); setOwnerEmail(''); setOwnerPassword('');
      onCreated();
    } catch (e: any) {
      setErr(e.message ?? 'Could not create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New organization"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Cancel</button>
          <button disabled={!name || !slug || saving} onClick={submit} className="px-5 py-2 text-sm font-semibold rounded-full bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create organization'}
          </button>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}
      <div className="space-y-4">
        <Field label="Organization name" required>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Curry Leaf Group" />
        </Field>
        <Field label="Slug" required hint="Used as URL prefix">
          <Input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="curry-leaf-group" className="font-mono" />
        </Field>
        <Field label="Contact phone">
          <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+91 98xxx xxxxx" />
        </Field>
        <Field label="Platform fee (₹ / month)" hint="Flat fee billed to the organization. We do not charge per-order commission.">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
            <Input type="number" min={0} step="100" value={flatFee} onChange={e => setFlatFee(Number(e.target.value))} className="pl-7" />
          </div>
        </Field>

        <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 space-y-3">
          <div>
            <p className="font-semibold text-purple-900">Owner account</p>
            <p className="text-xs text-purple-900/80">Creates the org admin's login. They'll see and manage every branch in this organization. They can later create branch-specific managers from their dashboard.</p>
          </div>
          <Field label="Owner name">
            <Input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Rajesh Kumar" />
          </Field>
          <Field label="Owner email" required>
            <Input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value.trim())} type="email" placeholder="rajesh@curryleaf.in" />
          </Field>
          <Field label="Owner password" required hint="At least 6 characters. They'll be able to change this after sign-in.">
            <div className="relative">
              <Input value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} type={showPwd ? 'text' : 'password'} placeholder="Choose a strong password" className="pr-16" />
              <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1">
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        </div>

        {savedNote && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900">{savedNote}</div>
        )}
      </div>
    </Modal>
  );
}

function CreateBranchModal({
  orgId, orgs, onClose, onCreated,
}: { orgId: string | null; orgs: OrgRow[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [area, setArea] = useState('');
  const [phone, setPhone] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [tableCount, setTableCount] = useState(8);
  const [autoSeed, setAutoSeed] = useState(true);
  // Up to 5 hero-image URLs for the customer Landing carousel. Empty rows
  // are filtered out at submit, so the owner can leave any of them blank.
  const [heroImages, setHeroImages] = useState<string[]>(['', '', '']);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  if (!orgId) return null;
  const org = orgs.find(o => o.id === orgId);

  const setHeroAt = (i: number, v: string) => setHeroImages(prev => {
    const next = [...prev]; next[i] = v; return next;
  });
  const addHeroSlot = () => setHeroImages(prev => prev.length >= 5 ? prev : [...prev, '']);
  const removeHeroAt = (i: number) => setHeroImages(prev => prev.filter((_, k) => k !== i));

  const submit = async () => {
    if (!name || !area || !slug) return;
    setSaving(true); setErr(null);
    try {
      const branch = await createBranch({
        organization_id: orgId,
        slug,
        name,
        branch_code: branchCode || null as any,
        area_name: area,
        city,
        phone,
        hero_images: heroImages,
      });
      if (autoSeed) {
        try {
          await seedNewBranch(branch.id, tableCount);
        } catch (seedErr: any) {
          // Seed failure isn't fatal — branch exists, owner can seed later
          console.warn('Seed failed (non-fatal):', seedErr);
        }
      }
      setCreatedSlug(slug);
      setName(''); setArea(''); setPhone(''); setBranchCode('');
      setHeroImages(['', '', '']);
      onCreated();
    } catch (e: any) {
      setErr(e.message ?? 'Could not create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!orgId}
      onClose={onClose}
      title={`Add branch to ${org?.name ?? ''}`}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-white">Cancel</button>
          <button disabled={!name || !area || !slug || saving} onClick={submit} className="px-5 py-2 text-sm font-semibold rounded-full bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create branch'}
          </button>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}
      <div className="space-y-4">
        <Field label="Branch name" required>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Spice Garden — Whitefield" />
        </Field>
        <Field label="Slug" required hint="Customer URL: /{slug}">
          <Input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="spice-garden-whitefield" className="font-mono" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" required>
            <Input value={city} onChange={e => setCity(e.target.value)} />
          </Field>
          <Field label="Area / locality" required>
            <Input value={area} onChange={e => setArea(e.target.value)} placeholder="Whitefield" />
          </Field>
        </div>
        <Field label="Phone">
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 80 xxxx xxxx" />
        </Field>
        <Field label="Branch code" hint="Short identifier, e.g. SG-WTF">
          <Input value={branchCode} onChange={e => setBranchCode(e.target.value.toUpperCase())} className="font-mono" placeholder="SG-WTF" />
        </Field>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">Hero images</p>
              <p className="text-xs text-slate-600">
                Up to 5 photos. They auto-rotate on the customer landing page. Paste a public URL each, e.g. from Unsplash, Cloudinary, or Supabase Storage.
              </p>
            </div>
            <button
              type="button"
              onClick={addHeroSlot}
              disabled={heroImages.length >= 5}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              title="Add another slot (max 5)"
            >
              <Plus className="size-3.5" /> Add slot
            </button>
          </div>
          <div className="space-y-2">
            {heroImages.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 size-5 grid place-items-center rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                    {i + 1}
                  </span>
                  <Input
                    value={url}
                    onChange={e => setHeroAt(i, e.target.value)}
                    placeholder="https://images.example.com/hero.jpg"
                    className="pl-9 font-mono text-xs"
                  />
                </div>
                {/* Tiny preview thumbnail if a URL is present */}
                {url && /^https?:\/\//i.test(url.trim()) ? (
                  <img
                    src={url}
                    alt=""
                    className="size-10 rounded-md object-cover border border-slate-200 shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="size-10 rounded-md border border-dashed border-slate-300 grid place-items-center text-slate-400 text-xs shrink-0">—</span>
                )}
                {heroImages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeHeroAt(i)}
                    className="size-8 grid place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                    title="Remove this image"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox" checked={autoSeed} onChange={e => setAutoSeed(e.target.checked)}
              className="size-4 mt-0.5 rounded border-purple-400 accent-purple-600"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-purple-900">Auto-seed tables + starter menu</p>
              <p className="text-xs text-purple-800 mt-0.5">
                Creates {tableCount} tables (with QR tokens) and a 10-item starter menu so the URL works immediately.
              </p>
            </div>
          </label>
          {autoSeed && (
            <Field label="Number of tables">
              <Input
                type="number" min={1} max={50} value={tableCount}
                onChange={e => setTableCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                className="w-24"
              />
            </Field>
          )}
        </div>

        {createdSlug && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
            <p className="font-semibold mb-1">Branch live</p>
            <p className="font-mono text-[11px] break-all">
              Customer site:&nbsp;<a href={`http://localhost:8081/${createdSlug}`} target="_blank" rel="noreferrer" className="underline">localhost:8081/{createdSlug}</a>
            </p>
            <p className="font-mono text-[11px] break-all mt-1">
              Table 1 QR target:&nbsp;<a href={`http://localhost:8081/${createdSlug}/t/${createdSlug}-t1`} target="_blank" rel="noreferrer" className="underline">localhost:8081/{createdSlug}/t/{createdSlug}-t1</a>
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {hint && <p className="text-xs text-slate-500 mb-1.5">{hint}</p>}
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cls('w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-purple-500', props.className)} />;
}

void Building2;
