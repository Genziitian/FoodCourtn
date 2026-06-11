import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChefHat, CheckCircle2, Flame, History, Printer,
  RefreshCcw, ShoppingBag, Utensils, Wifi, WifiOff,
} from 'lucide-react';
import { cls, elapsedMinSec, type KotStatus } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { FullscreenButton, useFullscreen } from '../components/FullscreenToggle';
import { useTenant } from '../lib/tenant';
import { printKot as sharedPrintKot, type KotPrintInput } from '../lib/printKot';
type KotPrintItem = KotPrintInput['items'][number];
import {
  listKotTickets, listKotHistory, subscribeToKots,
  updateKotStatus, incrementReprintCount,
  type KotTicketWithOrder,
} from '../lib/api';

type Filter = 'all' | 'dine_in' | 'takeaway' | 'ready';

const STATIONS: Array<{ key: Filter; label: string; icon: any }> = [
  { key: 'all',      label: 'Active',         icon: ChefHat },
  { key: 'dine_in',  label: 'Dine-in',        icon: Utensils },
  { key: 'takeaway', label: 'Takeaway',       icon: ShoppingBag },
  { key: 'ready',    label: 'Ready to Serve', icon: CheckCircle2 },
];

export default function Kds() {
  const { org, branch, branches, scopedRestaurantIds } = useTenant();
  const { fullscreen, toggle: toggleFullscreen } = useFullscreen('kds');
  const [tickets, setTickets] = useState<KotTicketWithOrder[]>([]);
  const [history, setHistory] = useState<KotTicketWithOrder[]>([]);
  const [view, setView] = useState<'active' | 'history'>('active');
  const [filter, setFilter] = useState<Filter>('all');
  const [tick, setTick] = useState(0);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ts, hs] = await Promise.all([
        listKotTickets(scopedRestaurantIds),
        listKotHistory(scopedRestaurantIds, 50),
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
  }, [scopedRestaurantIds]);

  useEffect(() => {
    if (scopedRestaurantIds.length === 0) {
      setTickets([]); setHistory([]); setLoading(false); return;
    }
    refresh();
    const unsub = subscribeToKots(scopedRestaurantIds, () => refresh());
    return unsub;
  }, [refresh, scopedRestaurantIds]);

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
      return true;
    });
  }, [view, tickets, history, filter]);

  const advance = async (t: KotTicketWithOrder) => {
    const next = nextStatus(t.status);
    if (next === t.status) return;
    setTickets(ts => ts.map(x => x.id === t.id ? { ...x, status: next } : x));
    try { await updateKotStatus(t.id, next, next === 'ready' ? t.items_total : undefined); }
    catch (e: any) { setError(e.message); refresh(); }
  };

  const reprint = async (t: KotTicketWithOrder) => {
    printKot(t);
    try { await incrementReprintCount(t.id, t.reprint_count ?? 0); refresh(); }
    catch (e) { console.warn('reprint count failed', e); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kitchen Display"
        subtitle={
          !org ? 'Sign in to see your kitchen'
          : `${branch ? branch.name : `All ${branches.length} branches`} · ${org.name}`
        }
        actions={
          <div className="flex items-center gap-3">
            <span className={cls(
              'inline-flex items-center gap-2 text-sm font-medium',
              connected ? 'text-emerald-600' : 'text-rose-600',
            )}>
              {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
              {connected ? 'Live' : 'Reconnecting…'}
            </span>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw className={cls('size-4', loading && 'animate-spin')} /> Refresh
            </button>
            <FullscreenButton fullscreen={fullscreen} toggle={toggleFullscreen} />
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              <button
                onClick={() => setView('active')}
                className={cls(
                  'px-3 py-1.5 text-xs font-semibold rounded inline-flex items-center gap-1.5',
                  view === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
                )}
              >
                <ChefHat className="size-3.5" /> Active
              </button>
              <button
                onClick={() => setView('history')}
                className={cls(
                  'px-3 py-1.5 text-xs font-semibold rounded inline-flex items-center gap-1.5',
                  view === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
                )}
              >
                <History className="size-3.5" /> History
              </button>
            </div>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      {/* Counters */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill color="rush"    label={`${counts.new} new`} />
        <Pill color="cooking" label={`${counts.cooking} cooking`} />
        <Pill color="ready"   label={`${counts.ready} ready`} />
      </div>

      {/* Station/type filter */}
      <div className="flex flex-wrap gap-2">
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
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300',
              )}
            >
              <Icon className="size-4" />
              {s.label}
              {count != null && (
                <span className={cls('rounded-md px-1.5 py-0.5 text-xs', isActive ? 'bg-white/20' : 'bg-slate-100')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tickets grid */}
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
        <div className="text-center py-16 bg-white rounded-2xl shadow-card border border-slate-100">
          <ChefHat className="size-10 mx-auto mb-3 text-slate-300" />
          {scopedRestaurantIds.length === 0 ? (
            <>
              <p className="text-lg font-semibold text-slate-700">No branches in scope</p>
              <p className="text-sm text-slate-500 mt-1">Your account isn't linked to any branch yet.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-700">No active tickets</p>
              <p className="text-sm text-slate-500 mt-1">Kitchen is quiet. New orders appear here automatically.</p>
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
        'rounded-2xl border bg-white overflow-hidden flex flex-col shadow-card',
        ticket.is_rush ? 'border-rose-300 shadow-[0_0_0_1px_rgba(239,68,68,0.2)]' : 'border-slate-200',
        isCooking && 'border-amber-300',
        isReady   && 'border-emerald-300',
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 gap-2">
        <div className="flex flex-col min-w-0">
          <span className="mono font-bold text-slate-900 leading-tight">{ticket.ticket_no}</span>
          {ticket.order_code && (
            <span className="mono text-[10px] text-slate-500 leading-tight">{ticket.order_code}</span>
          )}
        </div>
        {ticket.is_rush && (
          <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-bold shrink-0">
            <AlertTriangle className="size-3.5" /> RUSH
          </span>
        )}
        <span className={cls(
          'mono font-bold px-2 py-0.5 rounded text-xs shrink-0',
          isReady ? 'text-emerald-700 bg-emerald-100' :
          isCooking ? 'text-amber-700 bg-amber-100' :
          'text-rose-700 bg-rose-100',
        )}>
          {elapsed}
        </span>
      </div>

      <div className="px-4 py-2 flex items-center justify-between text-sm gap-2 bg-slate-50">
        <span className="inline-flex items-center gap-2 text-slate-700 min-w-0">
          {ticket.payload?.order_type === 'dine_in' ? (
            <><Utensils className="size-3.5 text-slate-400 shrink-0" /> <strong className="text-slate-900 truncate">{tableLabel ?? 'Table'}</strong></>
          ) : (
            <><ShoppingBag className="size-3.5 text-slate-400 shrink-0" /> <strong className="text-slate-900">Takeaway</strong></>
          )}
          {customerName && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600 truncate">{customerName}</span>
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-2 shrink-0">
          {(ticket.reprint_count ?? 0) > 0 && (
            <span className="text-[10px] text-amber-600" title="Reprinted">×{ticket.reprint_count}</span>
          )}
          <button
            onClick={onPrint}
            className="text-slate-400 hover:text-slate-700 transition"
            title="Print KOT"
            aria-label="Print KOT"
          >
            <Printer className="size-4" />
          </button>
          <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
            <Flame className="size-3.5" /> {capitalize(ticket.station)}
          </span>
        </span>
      </div>

      <div className="px-4 mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className={cls(
            'inline-flex items-center gap-1.5 font-semibold',
            isReady ? 'text-emerald-600' : isCooking ? 'text-amber-600' : 'text-rose-600',
          )}>
            <span className={cls(
              'size-1.5 rounded-full',
              isReady ? 'bg-emerald-500' : isCooking ? 'bg-amber-500' : 'bg-rose-500',
            )} />
            {isReady ? 'Ready' : isCooking ? 'Cooking' : 'New Order'}
          </span>
          <span className="text-slate-500 mono">{ticket.items_done}/{ticket.items_total} done</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cls(
              'h-full rounded-full transition-all',
              isReady ? 'bg-emerald-500' : isCooking ? 'bg-amber-500' : 'bg-rose-500',
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
                'flex items-start gap-3 rounded-lg border p-2.5 text-sm',
                done ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white',
              )}
            >
              <span className={cls(
                'mt-0.5 size-4 grid place-items-center rounded border-2 shrink-0',
                done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300',
              )}>
                {done && <CheckCircle2 className="size-3 text-white" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className={cls('font-semibold', done && 'line-through text-slate-500')}>{it.name}</p>
                {it.variant && (
                  <p className={cls('text-xs', done ? 'text-slate-400' : 'text-slate-500')}>{it.variant}</p>
                )}
                {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{it.modifiers.join(' · ')}</p>
                )}
              </div>
              <span className="mono text-slate-500 text-sm shrink-0">×{it.qty}</span>
            </li>
          );
        })}
      </ul>

      <div className="p-3 pt-2">
        {readOnly ? (
          <div className="text-center text-xs text-slate-500 py-2">
            Completed · {new Date(ticket.updated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        ) : ticket.status === 'ready' ? (
          <button
            onClick={onAdvance}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5"
          >
            <CheckCircle2 className="size-4" /> Complete &amp; Clear
          </button>
        ) : ticket.status === 'cooking' ? (
          <button
            onClick={onAdvance}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5"
          >
            <CheckCircle2 className="size-4" /> Mark Ready
          </button>
        ) : isNew ? (
          <button
            onClick={onAdvance}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5"
          >
            <Flame className="size-4" /> Start Cooking
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Pill({ color, label }: { color: 'rush'|'cooking'|'ready'; label: string }) {
  const cls_ = {
    rush:    'bg-rose-50 text-rose-700 border-rose-200',
    cooking: 'bg-amber-50 text-amber-700 border-amber-200',
    ready:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  }[color];
  return (
    <span className={cls('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold', cls_)}>
      <span className={cls(
        'size-1.5 rounded-full',
        color === 'rush' ? 'bg-rose-500' : color === 'cooking' ? 'bg-amber-500' : 'bg-emerald-500',
      )} />
      {label}
    </span>
  );
}

function nextStatus(s: KotStatus): KotStatus {
  if (s === 'new') return 'cooking';
  if (s === 'cooking') return 'ready';
  if (s === 'ready') return 'complete';
  return s;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function printKot(t: KotTicketWithOrder) {
  // Delegate to the shared helper so KDS + Orders print identically.
  const tableLabel = t.table_label_db ?? t.payload?.table_label ?? null;
  const customerName = t.customer_name_db ?? t.payload?.customer_name ?? null;
  return sharedPrintKot({
    ticket_no: t.ticket_no,
    order_code: t.order_code ?? null,
    order_type: t.payload?.order_type ?? null,
    table_label: tableLabel,
    customer_name: customerName,
    created_at: t.created_at,
    reprint_count: t.reprint_count ?? 0,
    items: (t.payload?.items ?? []) as KotPrintItem[],
  });
}
