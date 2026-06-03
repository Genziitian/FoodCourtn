import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChefHat, CheckCircle2, Coffee, Flame, History, Printer, RefreshCcw,
  ShoppingBag, Utensils, Volume2, Wifi, WifiOff,
} from 'lucide-react';
import { cls, elapsedMinSec, type KotStatus } from '@foodcourt/shared';
import {
  listBranches, listOrgs, listKotTickets, listKotHistory, subscribeToKots,
  updateKotStatus, incrementReprintCount,
  type BranchOption, type OrgOption, type KotTicketWithOrder,
} from './lib/api';
import { ADMIN_URL, CUSTOMER_URL } from './lib/urls';

type Filter = 'all' | 'dine_in' | 'takeaway' | 'ready' | 'grill' | 'curry' | 'tandoor';

const STATIONS: Array<{ key: Filter; label: string; icon: any }> = [
  { key: 'all',      label: 'All Active',     icon: ChefHat },
  { key: 'dine_in',  label: 'Dine-in',        icon: Utensils },
  { key: 'takeaway', label: 'Takeaway',       icon: ShoppingBag },
  { key: 'ready',    label: 'Ready to Serve', icon: CheckCircle2 },
  { key: 'grill',    label: 'Grill Station',  icon: Flame },
  { key: 'curry',    label: 'Curry Station',  icon: Coffee },
  { key: 'tandoor',  label: 'Tandoor',        icon: Flame },
];

const STORAGE_BRANCH = 'foodcourt-kds-branch-v1';
const STORAGE_ORG = 'foodcourt-kds-org-v1';

export default function App() {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgId, setOrgId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_ORG); } catch { return null; }
  });
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState<string | 'all'>(() => {
    try { return localStorage.getItem(STORAGE_BRANCH) ?? 'all'; } catch { return 'all'; }
  });
  const [tickets, setTickets] = useState<KotTicketWithOrder[]>([]);
  const [history, setHistory] = useState<KotTicketWithOrder[]>([]);
  const [view, setView] = useState<'active' | 'history'>('active');
  const [filter, setFilter] = useState<Filter>('all');
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(now());
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => { setTick(t => t + 1); setClock(now()); }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_BRANCH, branchId); } catch { /* ignore */ }
  }, [branchId]);

  useEffect(() => {
    try {
      if (orgId) localStorage.setItem(STORAGE_ORG, orgId);
      else localStorage.removeItem(STORAGE_ORG);
    } catch { /* ignore */ }
  }, [orgId]);

  // Load orgs + branches once
  useEffect(() => {
    Promise.all([listOrgs(), listBranches()])
      .then(([os, bs]) => {
        setOrgs(os);
        setBranches(bs);
        // Auto-pick the first org if nothing chosen yet
        if (!orgId && os.length > 0) setOrgId(os[0].id);
      })
      .catch(e => setError(e.message ?? 'Could not load orgs/branches'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Branches scoped to the picked org — this enforces the "one restaurant = one
  // KDS, no overlap" rule. Only branches belonging to the selected organization
  // appear in the picker and get subscribed to.
  const orgBranches = useMemo(
    () => orgId ? branches.filter(b => b.organization_id === orgId) : [],
    [orgId, branches],
  );

  const restaurantIds = useMemo(() => {
    if (!orgId) return [];
    if (branchId === 'all') return orgBranches.map(b => b.id);
    if (orgBranches.some(b => b.id === branchId)) return [branchId];
    return orgBranches.map(b => b.id);
  }, [orgId, branchId, orgBranches]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ts, hs] = await Promise.all([
        listKotTickets(restaurantIds),
        listKotHistory(restaurantIds, 50),
      ]);
      setTickets(ts);
      setHistory(hs);
      setConnected(true);
    } catch (e: any) {
      setError(e.message ?? 'Could not load tickets');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [restaurantIds]);

  useEffect(() => {
    if (!orgId || restaurantIds.length === 0) {
      setTickets([]); setHistory([]); setLoading(false);
      return;
    }
    refresh();
    const unsub = subscribeToKots(restaurantIds, () => {
      refresh();
    });
    return unsub;
  }, [refresh, restaurantIds, orgId]);

  const counts = useMemo(() => {
    const c = { new: 0, cooking: 0, ready: 0 };
    tickets.forEach(t => {
      if (t.status === 'new' || t.status === 'cooking' || t.status === 'ready') c[t.status] += 1;
    });
    return c;
  }, [tickets]);

  const filtered = useMemo(() => {
    if (view === 'history') return history;
    return tickets.filter(t => {
      if (filter === 'all') return t.status !== 'complete';
      if (filter === 'ready') return t.status === 'ready';
      if (filter === 'dine_in') return t.payload?.order_type === 'dine_in';
      if (filter === 'takeaway') return t.payload?.order_type === 'takeaway';
      return t.station === filter;
    });
  }, [view, tickets, history, filter]);

  const advance = async (t: KotTicketWithOrder) => {
    const next = nextStatus(t.status);
    if (next === t.status) return;
    setTickets(ts => ts.map(x => x.id === t.id ? { ...x, status: next } : x));
    try { await updateKotStatus(t.id, next, next === 'ready' ? t.items_total : undefined); }
    catch (e: any) { setError(e.message ?? 'Update failed'); refresh(); }
  };

  const reprint = async (t: KotTicketWithOrder) => {
    printKot(t);
    try { await incrementReprintCount(t.id, t.reprint_count ?? 0); refresh(); }
    catch (e) { console.warn('reprint count failed', e); }
  };

  const orgName = orgs.find(o => o.id === orgId)?.name ?? 'No restaurant selected';
  const branchName = branchId === 'all'
    ? `All ${orgBranches.length} branches`
    : orgBranches.find(b => b.id === branchId)?.name ?? '—';

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-5 flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="size-11 grid place-items-center rounded-full bg-brand-600/20 text-brand-500">
            <ChefHat className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold">Kitchen Display</h1>
            <p className="text-sm text-ink-500">{orgName} · {branchName}</p>
          </div>

          <select
            value={orgId ?? ''}
            onChange={e => { setOrgId(e.target.value || null); setBranchId('all'); }}
            className="rounded-lg bg-ink-800 border border-brand-500/40 text-slate-200 px-3 py-1.5 text-sm font-semibold focus:border-brand-500 outline-none"
            title="Restaurant / brand"
          >
            {orgs.length === 0 && <option value="">No restaurants yet</option>}
            {orgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>

          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            disabled={!orgId || orgBranches.length === 0}
            className="rounded-lg bg-ink-800 border border-ink-700 text-slate-200 px-3 py-1.5 text-sm font-semibold focus:border-brand-500 outline-none disabled:opacity-50"
            title="Branch within the restaurant"
          >
            <option value="all">All branches</option>
            {orgBranches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <div className="ml-2 flex items-center gap-2">
            <Pill color="rush"    label={`${counts.new}   New`} />
            <Pill color="cooking" label={`${counts.cooking} Cooking`} />
            <Pill color="ready"   label={`${counts.ready}   Ready`} />
          </div>

          <div className="ml-2 inline-flex rounded-lg bg-ink-800 border border-ink-700 p-0.5">
            <button
              onClick={() => setView('active')}
              className={cls(
                'px-3 py-1 text-xs font-semibold rounded inline-flex items-center gap-1.5',
                view === 'active' ? 'bg-brand-600 text-white' : 'text-slate-300',
              )}
            >
              <ChefHat className="size-3.5" /> Active
            </button>
            <button
              onClick={() => setView('history')}
              className={cls(
                'px-3 py-1 text-xs font-semibold rounded inline-flex items-center gap-1.5',
                view === 'history' ? 'bg-brand-600 text-white' : 'text-slate-300',
              )}
            >
              <History className="size-3.5" /> History
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={cls(
            'inline-flex items-center gap-2 text-sm font-medium',
            connected ? 'text-emerald-400' : 'text-rose-400',
          )}>
            {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
          <span className="mono text-2xl font-bold text-slate-200">{clock}</span>
          <IconBtn aria-label="Sound"><Volume2 className="size-4" /></IconBtn>
          <IconBtn onClick={refresh} aria-label="Refresh"><RefreshCcw className={cls('size-4', loading && 'animate-spin')} /></IconBtn>
          <a href={CUSTOMER_URL} target="_blank" rel="noreferrer" className="text-sm text-ink-500 hover:text-slate-200">Customer</a>
          <a href={ADMIN_URL} target="_blank" rel="noreferrer" className="text-sm text-ink-500 hover:text-slate-200">Admin</a>
          <span className="inline-flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-500">
            <Utensils className="size-3.5" /> KDS v2
          </span>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl bg-rose-900/30 border border-rose-600/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {STATIONS.map(s => {
          const Icon = s.icon;
          const isActive = filter === s.key;
          const count = s.key === 'all' ? filtered.length : s.key === 'ready' ? counts.ready : null;
          return (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={cls(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition',
                isActive
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'border-ink-700 text-slate-300 hover:border-ink-500 hover:bg-ink-800',
              )}
            >
              <Icon className="size-4" />
              {s.label}
              {count != null && (
                <span className={cls('rounded-md px-2 py-0.5 text-xs', isActive ? 'bg-white/20' : 'bg-ink-700')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(t => (
          <KotCard
            key={t.id}
            ticket={t}
            onAdvance={() => advance(t)}
            onPrint={() => reprint(t)}
            tick={tick}
            readOnly={view === 'history'}
          />
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="text-center py-24 text-ink-500">
          <ChefHat className="size-10 mx-auto mb-3 text-ink-700" />
          {!orgId ? (
            <>
              <p className="text-lg font-semibold">Pick a restaurant</p>
              <p className="text-sm mt-1">This KDS only shows orders for one restaurant at a time.</p>
            </>
          ) : orgBranches.length === 0 ? (
            <>
              <p className="text-lg font-semibold">No branches yet for {orgName}</p>
              <p className="text-sm mt-1">Add branches in Super Admin → Restaurants.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">No active tickets</p>
              <p className="text-sm mt-1">Kitchen is quiet. New orders appear here automatically.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function KotCard({
  ticket, onAdvance, onPrint, tick, readOnly,
}: {
  ticket: KotTicketWithOrder;
  onAdvance: () => void;
  onPrint: () => void;
  tick: number;
  readOnly?: boolean;
}) {
  const isReady = ticket.status === 'ready';
  const isCooking = ticket.status === 'cooking';
  const isNew = ticket.status === 'new';
  void tick;
  const elapsed = elapsedMinSec(ticket.created_at);
  const tableLabel = ticket.table_label_db ?? ticket.payload?.table_label ?? null;
  const customerName = ticket.customer_name_db ?? ticket.payload?.customer_name ?? null;

  return (
    <div
      className={cls(
        'rounded-2xl border bg-ink-800/60 overflow-hidden flex flex-col',
        ticket.is_rush ? 'border-rush-600/70 shadow-[0_0_0_1px_rgba(239,68,68,0.3)]' : 'border-ink-700',
        isCooking && 'border-cooking-500/60',
        isReady   && 'border-ready-600/70',
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700/70 gap-2">
        <div className="flex flex-col min-w-0">
          <span className="mono font-bold text-slate-100 leading-tight">{ticket.ticket_no}</span>
          {ticket.order_code && (
            <span className="mono text-[10px] text-slate-500 leading-tight">{ticket.order_code}</span>
          )}
        </div>
        {ticket.is_rush && (
          <span className="inline-flex items-center gap-1 text-rush-500 text-xs font-bold shrink-0">
            <AlertTriangle className="size-3.5" /> RUSH
          </span>
        )}
        <span className={cls(
          'mono font-bold px-2 py-0.5 rounded shrink-0',
          isReady ? 'text-ready-500 bg-ready-600/15' :
          isCooking ? 'text-cooking-500 bg-cooking-600/15' :
          'text-rush-500 bg-rush-600/15',
        )}>
          {elapsed}
        </span>
      </div>

      <div className="px-4 py-2 flex items-center justify-between text-sm gap-2">
        <span className="inline-flex items-center gap-2 text-slate-300 min-w-0">
          {ticket.payload?.order_type === 'dine_in' ? (
            <><Utensils className="size-3.5 text-slate-400 shrink-0" /> <strong className="text-slate-100 truncate">{tableLabel ?? 'Table'}</strong></>
          ) : (
            <><ShoppingBag className="size-3.5 text-slate-400 shrink-0" /> <strong className="text-slate-100">Takeaway</strong></>
          )}
          {customerName && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-slate-300 truncate">{customerName}</span>
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-2 shrink-0">
          {(ticket.reprint_count ?? 0) > 0 && (
            <span className="text-[10px] text-amber-400" title="Reprinted">×{ticket.reprint_count}</span>
          )}
          <button
            onClick={onPrint}
            className="text-slate-400 hover:text-slate-200 transition"
            title="Print KOT"
            aria-label="Print KOT"
          >
            <Printer className="size-4" />
          </button>
          <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
            <Flame className="size-3.5" /> {capitalize(ticket.station)}
          </span>
        </span>
      </div>

      <div className="px-4 mt-1">
        <div className="flex items-center justify-between text-xs">
          <span className={cls(
            'inline-flex items-center gap-1.5',
            isReady ? 'text-ready-500' : isCooking ? 'text-cooking-500' : 'text-rush-500',
          )}>
            <span className={cls(
              'size-1.5 rounded-full',
              isReady ? 'bg-ready-500' : isCooking ? 'bg-cooking-500' : 'bg-rush-500',
            )} />
            {isReady ? 'Ready' : isCooking ? 'Cooking' : 'New Order'}
          </span>
          <span className="text-ink-500 mono">{ticket.items_done}/{ticket.items_total} done</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-ink-700 overflow-hidden">
          <div
            className={cls(
              'h-full rounded-full transition-all',
              isReady ? 'bg-ready-500' : isCooking ? 'bg-cooking-500' : 'bg-rush-500',
            )}
            style={{ width: `${(ticket.items_done / Math.max(1, ticket.items_total)) * 100}%` }}
          />
        </div>
      </div>

      <ul className="flex-1 p-3 space-y-2">
        {(ticket.payload?.items ?? []).map((it: any, i: number) => {
          const done = i < ticket.items_done;
          return (
            <li
              key={it.id ?? i}
              className={cls(
                'flex items-start gap-3 rounded-xl border p-3',
                done ? 'border-ink-700 bg-ink-700/30' : 'border-ink-700 bg-ink-800',
              )}
            >
              <span className={cls(
                'mt-0.5 size-5 grid place-items-center rounded border-2 shrink-0',
                done ? 'bg-ready-500 border-ready-500' : 'border-ink-500',
              )}>
                {done && <CheckCircle2 className="size-4 text-white" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className={cls('font-semibold', done && 'line-through text-slate-400')}>{it.name}</p>
                {it.variant && (
                  <p className={cls('text-xs', done ? 'text-slate-500' : 'text-slate-400')}>{it.variant}</p>
                )}
                {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{it.modifiers.join(' · ')}</p>
                )}
              </div>
              <span className="mono text-slate-400 text-sm">×{it.qty}</span>
            </li>
          );
        })}
      </ul>

      <div className="p-3 pt-2">
        {readOnly ? (
          <div className="text-center text-xs text-ink-500 py-2">
            Completed · {new Date(ticket.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        ) : ticket.status === 'ready' ? (
          <button
            onClick={onAdvance}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ready-600 hover:bg-ready-500 text-white font-semibold py-3"
          >
            <CheckCircle2 className="size-4" /> Complete &amp; Clear
          </button>
        ) : ticket.status === 'cooking' ? (
          <button
            onClick={onAdvance}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-ink-900 font-semibold py-3"
          >
            <CheckCircle2 className="size-4" /> Mark Ready
          </button>
        ) : isNew ? (
          <button
            onClick={onAdvance}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3"
          >
            <Flame className="size-4" /> Start Cooking
          </button>
        ) : null}
      </div>
    </div>
  );
}

function nextStatus(s: KotStatus): KotStatus {
  if (s === 'new') return 'cooking';
  if (s === 'cooking') return 'ready';
  if (s === 'ready') return 'complete';
  return s;
}

function Pill({ color, label }: { color: 'rush'|'cooking'|'ready'; label: string }) {
  const cls_ = {
    rush:    'bg-rush-600/15 text-rush-500',
    cooking: 'bg-amber-500/15 text-amber-400',
    ready:   'bg-ready-600/15 text-ready-500',
  }[color];
  return (
    <span className={cls('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', cls_)}>
      <span className={cls(
        'size-1.5 rounded-full',
        color === 'rush' ? 'bg-rush-500' : color === 'cooking' ? 'bg-amber-400' : 'bg-ready-500',
      )} />
      {label}
    </span>
  );
}

function IconBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className="size-9 grid place-items-center rounded-full border border-ink-700 hover:bg-ink-800 text-slate-300">
      {children}
    </button>
  );
}

function now() {
  return new Date().toLocaleTimeString('en-IN', { hour12: false });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Open a print-friendly window with the KOT contents and trigger print.
 * Works without a thermal printer — uses the browser's print dialog.
 * For real thermal printing in production, wire to a local agent / ESC/POS.
 */
function printKot(t: KotTicketWithOrder) {
  const tableLabel = t.table_label_db ?? t.payload?.table_label ?? null;
  const customerName = t.customer_name_db ?? t.payload?.customer_name ?? null;
  const items = (t.payload?.items ?? []) as Array<{ name: string; variant: string | null; modifiers: string[]; qty: number; notes?: string }>;

  const html = `<!doctype html>
<html><head><title>${t.ticket_no}</title>
<style>
  @page { size: 80mm auto; margin: 4mm }
  body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #000; }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; letter-spacing: 1px }
  .meta { text-align: center; font-size: 11px; margin-bottom: 6px; line-height: 1.4 }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0 }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0 }
  .qty { font-weight: 700; flex: 0 0 28px }
  .name { flex: 1; }
  .note { padding-left: 32px; font-size: 11px; font-style: italic }
  .footer { margin-top: 8px; text-align: center; font-size: 11px; opacity: .8 }
</style></head>
<body>
  <h1>${t.ticket_no}</h1>
  <div class="meta">
    ${t.order_code ? t.order_code + ' · ' : ''}
    ${t.payload?.order_type === 'dine_in' ? (tableLabel ?? 'Dine-in') : 'Takeaway'}
    ${customerName ? '<br>' + escapeHtml(customerName) : ''}
    <br>${new Date(t.created_at).toLocaleString('en-IN')}
  </div>
  <hr>
  ${items.map(it => `
    <div class="row">
      <span class="qty">×${it.qty}</span>
      <span class="name">
        <strong>${escapeHtml(it.name)}</strong>
        ${it.variant ? ' · ' + escapeHtml(it.variant) : ''}
      </span>
    </div>
    ${(it.modifiers ?? []).length ? `<div class="note">+ ${it.modifiers.map(escapeHtml).join(', ')}</div>` : ''}
    ${it.notes ? `<div class="note">"${escapeHtml(it.notes)}"</div>` : ''}
  `).join('')}
  <hr>
  <div class="footer">
    ${items.reduce((s, it) => s + it.qty, 0)} items total
    ${(t.reprint_count ?? 0) > 0 ? `<br>REPRINT #${(t.reprint_count ?? 0) + 1}` : ''}
  </div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200) }</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) { alert('Allow popups to print KOTs'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
