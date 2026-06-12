import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, ChefHat, CheckCircle2, Clock, Download, MoreHorizontal,
  Printer, RotateCcw, Search, ShoppingBag, Utensils, X,
} from 'lucide-react';
import { cls, inr } from '@foodcourt/shared';
import { printKot as sharedPrintKot } from '../lib/printKot';
import { OrderStatusPill, PaymentStatusPill, TypePill } from '../components/StatusPill';
import { Drawer } from '../components/Drawer';
import { PageHeader } from '../components/PageHeader';
import { FullscreenButton, useFullscreen } from '../components/FullscreenToggle';
import { useTenant } from '../lib/tenant';
import {
  type AdminOrder, listOrders, subscribeToOrders, updateOrderStatus, cancelOrder,
} from '../lib/api';

type StatusFilter = 'all' | 'active' | AdminOrder['status'];
type TypeFilter = 'all' | 'dine_in' | 'takeaway';

const NEXT: Record<AdminOrder['status'], AdminOrder['status'] | null> = {
  received:  'preparing',
  preparing: 'ready',
  ready:     'completed',
  completed: null,
  cancelled: null,
};

// "Advance to next state" button — label depends on BOTH the current
// status AND the order type, so the kitchen sees the same wording the
// customer will see next on their tracking screen.
type AdvanceKey = Exclude<AdminOrder['status'], 'completed' | 'cancelled'>;
function nextLabel(orderType: AdminOrder['type'], status: AdvanceKey): { label: string; icon: any } {
  if (status === 'received')  return { label: 'Start Preparing', icon: ChefHat };
  if (status === 'preparing') {
    if (orderType === 'delivery') return { label: 'Out for Delivery',  icon: Bell };
    if (orderType === 'takeaway') return { label: 'Mark Prepared',     icon: Bell };
    return                                 { label: 'Mark Ready',       icon: Bell };
  }
  // status === 'ready'
  if (orderType === 'delivery') return { label: 'Mark Shipped',      icon: CheckCircle2 };
  return                                  { label: 'Complete',          icon: CheckCircle2 };
}

export default function Orders() {
  const { scopedRestaurantIds, branch, branches } = useTenant();
  const { fullscreen, toggle: toggleFullscreen } = useFullscreen('orders');
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  // Initial load
  const refetch = async () => {
    if (!scopedRestaurantIds.length) { setOrders([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const rows = await listOrders({ restaurantIds: scopedRestaurantIds, limit: 200 });
      setOrders(rows);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refetch(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scopedRestaurantIds.join('|')]);

  // Realtime: re-fetch on any INSERT/UPDATE in our restaurants
  useEffect(() => {
    if (!scopedRestaurantIds.length) return;
    const unsub = subscribeToOrders(scopedRestaurantIds, () => { refetch(); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedRestaurantIds.join('|')]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, received: 0, preparing: 0, ready: 0, completed: 0, cancelled: 0 };
    orders.forEach(o => {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (o.status !== 'completed' && o.status !== 'cancelled') c.active += 1;
    });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(o => {
      if (statusFilter === 'active' && (o.status === 'completed' || o.status === 'cancelled')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && o.status !== statusFilter) return false;
      if (typeFilter !== 'all' && o.type !== typeFilter) return false;
      if (q && !(
        o.code.toLowerCase().includes(q) ||
        (o.customer_name?.toLowerCase().includes(q) ?? false) ||
        (o.table_label?.toLowerCase().includes(q) ?? false) ||
        o.items.some(i => i.name.toLowerCase().includes(q))
      )) return false;
      return true;
    });
  }, [orders, statusFilter, typeFilter, query]);

  const advance = async (id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const next = NEXT[order.status];
    if (!next) return;
    // Optimistic update
    setOrders(os => os.map(o => o.id === id ? { ...o, status: next } : o));
    try {
      await updateOrderStatus(id, next);
    } catch (e: any) {
      console.error('updateOrderStatus failed:', e);
      refetch();
    }
  };

  const cancel = async (id: string) => {
    setOrders(os => os.map(o => o.id === id ? { ...o, status: 'cancelled' } : o));
    try { await cancelOrder(id); } catch { refetch(); }
  };

  const reprint = (id: string) => {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    // We don't have a KOT ticket row directly here, but the order carries
    // everything we need to render the same 80mm thermal receipt that KDS
    // prints. Use the order code as the ticket number — that's what most
    // kitchens already reference verbally ("table 12, FC-100036"), and it
    // tells the customer that this is a reprint of their order if they
    // ever see it.
    sharedPrintKot({
      ticket_no: o.code,
      order_code: o.code,
      order_type: o.type,
      table_label: o.table_label,
      customer_name: o.customer_name,
      created_at: o.created_at,
      reprint_count: 1,
      items: (o.items ?? []).map(it => ({
        name: it.name,
        variant: it.variant ?? null,
        modifiers: [],   // AdminOrder.items doesn't carry modifiers; KOT shows the line as-is
        qty: it.qty,
        notes: it.notes ?? null,
      })),
    });
  };

  const openOrder = orders.find(o => o.id === openOrderId) ?? null;
  const scopeLabel = branch ? branch.name : `All ${branches.length} branches`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        subtitle={
          loading
            ? 'Loading from Supabase…'
            : error
              ? `Error: ${error}`
              : `${scopeLabel} · ${counts.active} active · ${counts.completed} completed · ${counts.cancelled} cancelled today`
        }
        actions={
          <>
            <button onClick={refetch} className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RotateCcw className="size-4" />
              Refresh
            </button>
            <FullscreenButton fullscreen={fullscreen} toggle={toggleFullscreen} />
            <button className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="size-4" />
              Export
            </button>
          </>
        }
      />

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 pt-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
          <Tab active={statusFilter === 'active'}    onClick={() => setStatusFilter('active')}    label="Active"    count={counts.active} />
          <Tab active={statusFilter === 'received'}  onClick={() => setStatusFilter('received')}  label="Received"  count={counts.received} />
          <Tab active={statusFilter === 'preparing'} onClick={() => setStatusFilter('preparing')} label="Preparing" count={counts.preparing} />
          <Tab active={statusFilter === 'ready'}     onClick={() => setStatusFilter('ready')}     label="Ready"     count={counts.ready} />
          <Tab active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} label="Completed" count={counts.completed} />
          <Tab active={statusFilter === 'cancelled'} onClick={() => setStatusFilter('cancelled')} label="Cancelled" count={counts.cancelled} />
          <Tab active={statusFilter === 'all'}       onClick={() => setStatusFilter('all')}       label="All"       count={orders.length} />
          <span className="ml-auto pr-3 inline-flex items-center gap-2 text-xs text-emerald-600 font-semibold">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live · realtime
          </span>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-slate-100">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by code, customer, table, item..."
              className="w-full rounded-full bg-slate-100 pl-10 pr-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm">
            <SegBtn active={typeFilter === 'all'}      onClick={() => setTypeFilter('all')}>All</SegBtn>
            <SegBtn active={typeFilter === 'dine_in'}  onClick={() => setTypeFilter('dine_in')}>
              <Utensils className="size-3.5" /> Dine-in
            </SegBtn>
            <SegBtn active={typeFilter === 'takeaway'} onClick={() => setTypeFilter('takeaway')}>
              <ShoppingBag className="size-3.5" /> Takeaway
            </SegBtn>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(o => {
                const next = NEXT[o.status];
                const nextMeta = next != null && o.status !== 'completed' && o.status !== 'cancelled'
                  ? nextLabel(o.type, o.status as AdvanceKey)
                  : null;
                return (
                  <tr
                    key={o.id}
                    className="hover:bg-slate-50 cursor-pointer transition"
                    onClick={() => setOpenOrderId(o.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-slate-900">{o.code}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <TypePill type={o.type} />
                        {o.table_label && <span className="text-xs text-slate-500">{o.table_label}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{o.customer_name ?? <span className="text-slate-400 italic">Anonymous</span>}</p>
                      {o.customer_phone && <p className="text-xs text-slate-500">{o.customer_phone}</p>}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="text-slate-700 truncate">
                        {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                      </p>
                      <p className="text-xs text-slate-500">{o.item_count} items</p>
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusPill status={o.status} orderType={o.type} />
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusPill status={o.payment_status as any} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{inr(o.total)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <Clock className="size-3.5" />
                        {o.age_minutes}m
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 justify-end">
                        {nextMeta && next && (
                          <button
                            onClick={() => advance(o.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-brand-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-brand-700"
                          >
                            <nextMeta.icon className="size-3.5" />
                            {nextMeta.label}
                          </button>
                        )}
                        <button
                          onClick={() => reprint(o.id)}
                          className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500"
                          title="Reprint KOT"
                        >
                          <Printer className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-slate-500 py-12">
              {orders.length === 0
                ? `No orders yet. Place a test order from the customer app on the ${scopeLabel} URL.`
                : 'No orders match your filters.'}
            </p>
          )}
          {loading && (
            <p className="text-center text-slate-500 py-12">Loading…</p>
          )}
        </div>
      </div>

      <OrderDetailDrawer
        order={openOrder}
        onClose={() => setOpenOrderId(null)}
        onAdvance={() => openOrder && advance(openOrder.id)}
        onCancel={() => openOrder && cancel(openOrder.id)}
        onReprint={() => openOrder && reprint(openOrder.id)}
      />
    </div>
  );
}

function Tab({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        'px-4 py-3 -mb-px border-b-2 text-sm font-semibold transition-colors',
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      {label}
      <span className={cls(
        'ml-2 rounded-full px-2 py-0.5 text-xs font-semibold',
        active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600',
      )}>
        {count}
      </span>
    </button>
  );
}

function SegBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold transition-colors',
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Drawer
// ────────────────────────────────────────────────────────────

function OrderDetailDrawer({
  order, onClose, onAdvance, onCancel, onReprint,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onAdvance: () => void;
  onCancel: () => void;
  onReprint: () => void;
}) {
  if (!order) return null;
  const next = NEXT[order.status];

  return (
    <Drawer
      open={!!order}
      onClose={onClose}
      title={order.code}
      subtitle={`${order.type === 'dine_in' ? 'Dine-in' : 'Takeaway'}${order.table_label ? ' · ' + order.table_label : ''}${order.customer_name ? ' · ' + order.customer_name : ''}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onReprint}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
          >
            <Printer className="size-4" /> Reprint KOT
          </button>
          <div className="flex items-center gap-2">
            {order.status !== 'completed' && order.status !== 'cancelled' && (
              <button
                onClick={onCancel}
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 text-rose-700 px-4 py-2 text-sm font-semibold hover:bg-rose-50"
              >
                <X className="size-4" /> Cancel order
              </button>
            )}
            {next && order.status !== 'completed' && order.status !== 'cancelled' && (
              <button
                onClick={onAdvance}
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
              >
                <RotateCcw className="size-4" />
                {nextLabel(order.type, order.status as AdvanceKey).label}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <InfoBlock label="Status">
            <OrderStatusPill status={order.status} orderType={order.type} />
          </InfoBlock>
          <InfoBlock label="Payment">
            <PaymentStatusPill status={order.payment_status as any} />
          </InfoBlock>
          <InfoBlock label="Order age">
            <span className="font-semibold">{order.age_minutes} min</span>
          </InfoBlock>
          <InfoBlock label="Items">
            <span className="font-semibold">{order.item_count}</span>
          </InfoBlock>
        </div>

        <section>
          <h3 className="text-sm font-bold mb-3">Items</h3>
          <ul className="space-y-2">
            {order.items.map((it) => (
              <li key={it.id} className="flex items-start justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{it.name}</p>
                  {it.variant && <p className="text-xs text-slate-500">{it.variant}</p>}
                  {it.notes && <p className="text-xs text-slate-500 italic">{it.notes}</p>}
                </div>
                <span className="font-mono font-bold text-slate-700">×{it.qty}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-slate-50 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-bold mb-2">Bill</h3>
          <Row label="Subtotal" value={inr(order.subtotal)} />
          {order.discount > 0 && <Row label="Discount" value={`- ${inr(order.discount)}`} positive />}
          <div className="pt-2 mt-2 border-t border-slate-200 flex items-center justify-between font-bold">
            <span>Total</span>
            <span>{inr(order.total)}</span>
          </div>
        </section>

        {order.customer_notes && (
          <section>
            <h3 className="text-sm font-bold mb-2">Customer notes</h3>
            <p className="text-sm text-slate-600 italic bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {order.customer_notes}
            </p>
          </section>
        )}

        <button className="w-full text-sm text-slate-500 inline-flex items-center justify-center gap-1 hover:text-slate-700">
          <MoreHorizontal className="size-4" />
          Full audit trail (coming soon)
        </button>
      </div>
    </Drawer>
  );
}

function InfoBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={positive ? 'text-emerald-600' : 'text-slate-600'}>{label}</span>
      <span className={cls('font-semibold', positive ? 'text-emerald-600' : 'text-slate-900')}>{value}</span>
    </div>
  );
}

// suppress unused
export const _ = { AlertTriangle };
