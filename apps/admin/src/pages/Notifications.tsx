import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, ChefHat, CreditCard, Filter, LifeBuoy, Server, ShoppingBag, User,
} from 'lucide-react';
import { cls } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Drawer';
import { useTenant } from '../lib/tenant';
import {
  listOrders, listPayments, listAuditLog, raiseSupportTicket,
  type AdminOrder, type AdminPaymentRowDb, type AuditRow, type TicketPriority,
} from '../lib/api';

type NotificationKind = 'order' | 'payment' | 'kitchen' | 'staff' | 'system';

const KIND_STYLE: Record<NotificationKind, { bg: string; icon: any }> = {
  order:   { bg: 'bg-blue-50 text-blue-600',       icon: ShoppingBag },
  payment: { bg: 'bg-rose-50 text-rose-600',       icon: CreditCard },
  kitchen: { bg: 'bg-amber-50 text-amber-700',     icon: ChefHat },
  staff:   { bg: 'bg-purple-50 text-purple-700',   icon: User },
  system:  { bg: 'bg-slate-100 text-slate-600',    icon: Server },
};

const KINDS: Array<{ key: NotificationKind | 'all'; label: string }> = [
  { key: 'all',     label: 'All' },
  { key: 'order',   label: 'Orders' },
  { key: 'payment', label: 'Payments' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'system',  label: 'System' },
];

interface Notif {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  time_min: number;
  read: boolean;
}

function minutesAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function deriveNotifications(orders: AdminOrder[], payments: AdminPaymentRowDb[]): Notif[] {
  const orderNotifs: Notif[] = orders.slice(0, 30).map(o => ({
    id: `o-${o.id}`,
    kind: o.status === 'received' ? 'order' : 'kitchen',
    title: o.status === 'received'
      ? `New order ${o.code}`
      : `${o.code} → ${o.status}`,
    message: `${o.item_count} item${o.item_count === 1 ? '' : 's'} · ${o.customer_name ?? 'Customer'}${o.table_label ? ` · ${o.table_label}` : ''}`,
    time_min: minutesAgo(o.created_at),
    read: o.status === 'completed' || o.status === 'cancelled',
  }));

  const paymentNotifs: Notif[] = payments
    .filter(p => p.status === 'failed' || p.status === 'refunded')
    .slice(0, 20)
    .map(p => ({
      id: `p-${p.id}`,
      kind: 'payment' as NotificationKind,
      title: p.status === 'failed' ? `Payment failed · ${p.order_code}` : `Refund issued · ${p.order_code}`,
      message: p.failure_reason ?? `${p.provider} · ${p.method}`,
      time_min: minutesAgo(p.created_at),
      read: false,
    }));

  return [...orderNotifs, ...paymentNotifs].sort((a, b) => a.time_min - b.time_min);
}

export default function Notifications() {
  const { scopedRestaurantIds, branch } = useTenant();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRowDb[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [readState, setReadState] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<NotificationKind | 'all'>('all');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [os, ps, al] = await Promise.all([
        listOrders({ restaurantIds: scopedRestaurantIds, limit: 50 }),
        listPayments(scopedRestaurantIds),
        listAuditLog(scopedRestaurantIds, 30),
      ]);
      setOrders(os);
      setPayments(ps);
      setAudit(al);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [scopedRestaurantIds]);

  useEffect(() => { refresh(); }, [refresh]);

  const items = useMemo(() => {
    const ns = deriveNotifications(orders, payments);
    return ns.map(n => ({ ...n, read: n.read || readState.has(n.id) }));
  }, [orders, payments, readState]);

  const filtered = useMemo(
    () => filter === 'all' ? items : items.filter(n => n.kind === filter),
    [items, filter],
  );

  const unread = items.filter(i => !i.read).length;

  const markAllRead = () => {
    const ids = new Set(items.map(i => i.id));
    setReadState(ids);
  };
  const toggleRead = (id: string) =>
    setReadState(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const [ticketOpen, setTicketOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={loading ? 'Loading…' : `${unread} unread · ${items.length} total`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTicketOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 text-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <LifeBuoy className="size-4" /> Raise support ticket
            </button>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
              >
                Mark all read
              </button>
            )}
          </div>
        }
      />

      <RaiseTicketModal
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        restaurantId={branch?.id ?? null}
        restaurantName={branch?.name ?? null}
      />

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-4 pt-3 flex items-center gap-1 border-b border-slate-100 overflow-x-auto no-scrollbar">
          <Filter className="size-4 text-slate-400 ml-2" />
          {KINDS.map(k => {
            const count = k.key === 'all' ? items.length : items.filter(i => i.kind === k.key).length;
            return (
              <button
                key={k.key}
                onClick={() => setFilter(k.key)}
                className={cls(
                  'px-3 py-3 -mb-px border-b-2 text-sm font-semibold whitespace-nowrap',
                  filter === k.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                {k.label}
                <span className={cls(
                  'ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold',
                  filter === k.key ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600',
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </header>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Bell className="size-10 mx-auto text-slate-300" />
            <p className="mt-3 text-slate-500">No notifications in this category.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(n => {
              const k = KIND_STYLE[n.kind];
              const Icon = k.icon;
              const isAlert = n.kind === 'payment';
              return (
                <li
                  key={n.id}
                  className={cls('px-6 py-4 flex items-start gap-4 hover:bg-slate-50/60', !n.read && 'bg-brand-50/30')}
                >
                  <span className={cls('size-10 grid place-items-center rounded-xl shrink-0', k.bg)}>
                    {isAlert ? <AlertTriangle className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cls('font-semibold', !n.read && 'text-slate-900')}>{n.title}</p>
                      {!n.read && <span className="size-2 rounded-full bg-brand-500" />}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-500">{formatMin(n.time_min)}</p>
                    <button
                      onClick={() => toggleRead(n.id)}
                      className="mt-1 text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {n.read ? 'Mark unread' : 'Mark read'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <section className="bg-white rounded-2xl shadow-card overflow-hidden">
        <header className="px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold">Audit log</h2>
          <p className="text-sm text-slate-500">Staff actions across the selected scope</p>
        </header>
        <ul className="divide-y divide-slate-100">
          {audit.map(a => (
            <li key={a.id} className="px-6 py-3 flex items-center gap-3">
              <span className="size-8 grid place-items-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold shrink-0">
                {a.actor_id?.slice(0, 2).toUpperCase() ?? 'SY'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <strong className="font-semibold">{a.action}</strong>
                  <span className="text-slate-600">{a.entity && ` · ${a.entity}`}</span>
                </p>
              </div>
              <span className="text-xs text-slate-500">{formatMin(minutesAgo(a.created_at))}</span>
            </li>
          ))}
          {audit.length === 0 && (
            <li className="px-6 py-8 text-sm text-center text-slate-500">No audit entries yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function formatMin(m: number): string {
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function RaiseTicketModal({
  open, onClose, restaurantId, restaurantName,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string | null;
  restaurantName: string | null;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [raisedBy, setRaisedBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const submit = async () => {
    if (!subject.trim()) { setErr('Subject is required'); return; }
    setSaving(true); setErr(null);
    try {
      const id = await raiseSupportTicket({
        restaurant_id: restaurantId,
        subject: subject.trim(),
        body: body.trim() || undefined,
        priority,
        raised_by: raisedBy.trim() || undefined,
      });
      setSavedId(id);
      setSubject(''); setBody(''); setPriority('normal'); setRaisedBy('');
    } catch (e: any) {
      setErr(e.message ?? 'Could not raise ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { setSavedId(null); onClose(); }}
      title="Raise a support ticket"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={() => { setSavedId(null); onClose(); }} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white rounded-full">
            {savedId ? 'Close' : 'Cancel'}
          </button>
          {!savedId && (
            <button
              onClick={submit}
              disabled={saving || !subject.trim()}
              className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? 'Sending…' : 'Send to platform support'}
            </button>
          )}
        </div>
      }
    >
      {savedId ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900">
          <p className="font-semibold mb-1">Ticket sent</p>
          <p>Platform support has been notified. You can track status under the same page later.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            For {restaurantName ? <strong>{restaurantName}</strong> : 'your account'}. Platform admins will see this in their Super Admin → Support Tickets view.
          </p>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" placeholder="e.g. Razorpay webhook keeps failing" autoFocus />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Details</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 resize-none" placeholder="What happened, when, and what you expected" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Priority</span>
              <select value={priority} onChange={e => setPriority(e.target.value as TicketPriority)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Your name (optional)</span>
              <input value={raisedBy} onChange={e => setRaisedBy(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500" placeholder="Owner" />
            </label>
          </div>
          {err && <p className="text-sm text-rose-700 bg-rose-50 rounded-lg p-2">{err}</p>}
        </div>
      )}
    </Modal>
  );
}
