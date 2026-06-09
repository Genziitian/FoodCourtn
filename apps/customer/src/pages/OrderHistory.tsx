import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { OrderStatus } from '@foodcourt/shared';
import { cls, inr } from '@foodcourt/shared';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../lib/auth';
import { useOrderHistory } from '../lib/data';

type StatusFilter = 'all' | 'active' | OrderStatus;

const STATUS_STYLE: Record<OrderStatus, { bg: string; text: string; label: string }> = {
  received:  { bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Received' },
  preparing: { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Preparing' },
  ready:     { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Ready' },
  completed: { bg: 'bg-slate-100',   text: 'text-slate-700',   label: 'Completed' },
  cancelled: { bg: 'bg-rose-100',    text: 'text-rose-700',    label: 'Cancelled' },
};

export default function OrderHistory() {
  const { slug, qrToken } = useParams();
  const navigate = useNavigate();
  const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug ?? 'the-spice-route'}`;

  const { customerId } = useAuth();
  const { orders, loading } = useOrderHistory(customerId);

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(o => {
      // status filter
      if (filter === 'active' && (o.status === 'completed' || o.status === 'cancelled')) return false;
      if (filter !== 'all' && filter !== 'active' && o.status !== filter) return false;
      // search
      if (q) {
        const matchesCode = o.code.toLowerCase().includes(q);
        const matchesItem = (o.items ?? []).some(it => it.item_name.toLowerCase().includes(q));
        if (!matchesCode && !matchesItem) return false;
      }
      return true;
    });
  }, [orders, filter, query]);

  const reorder = (orderCode: string) => {
    // For now, just open the order tracking page
    navigate(`${base}/order/${orderCode}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24 font-sans">
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex items-center justify-between px-container-margin h-16">
        <button onClick={() => navigate(`${base}/profile`)} className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50">
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <h1 className="font-display text-headline-md text-on-surface">Order Status</h1>
        <span className="w-10" />
      </header>

      <main className="max-w-md mx-auto px-container-margin pt-5 space-y-4">
        {/* Search */}
        <div className="relative">
          <Icon name="search" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by order code or dish name…"
            className="w-full rounded-pill bg-surface-container-low border border-outline-variant/30 pl-11 pr-10 py-3 text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-full hover:bg-surface-container-high text-on-surface-variant"
              aria-label="Clear search"
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="no-scrollbar overflow-x-auto flex gap-2">
          {(['all','active','completed','cancelled'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cls(
                'shrink-0 rounded-pill px-4 py-2 text-label-bold transition capitalize',
                filter === f
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container-lowest border border-outline-variant/30 text-on-surface hover:bg-surface-container-low',
              )}
            >
              {f === 'all' ? 'All orders' : f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card p-10 text-center">
            <div className="mx-auto size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="mt-3 text-on-surface-variant">Loading your orders…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center">
            <Icon name="receipt_long" size={48} className="mx-auto text-on-surface-variant/40" />
            <p className="mt-4 text-on-surface-variant">
              {query ? 'No orders match your search.' : orders.length === 0 ? 'No orders yet.' : 'No orders in this view.'}
            </p>
            <button
              onClick={() => navigate(`${base}/menu`)}
              className="mt-5 rounded-pill bg-primary text-on-primary font-semibold px-5 py-2.5 active:scale-95"
            >
              Browse menu
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(o => {
              const s = STATUS_STYLE[o.status];
              const ageMin = Math.max(0, Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000));
              return (
                <li key={o.id}>
                  <button
                    onClick={() => navigate(`${base}/order/${o.code}`)}
                    className="w-full text-left card p-4 hover:bg-surface-container-low transition active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-on-surface">{o.code}</p>
                        <p className="text-label-sm text-on-surface-variant capitalize">
                          {o.type === 'dine_in'
                            ? `Dine-in${(o as any).table_label ? ' · ' + (o as any).table_label : ''}`
                            : 'Takeaway'}
                        </p>
                      </div>
                      <span className={cls('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold', s.bg, s.text)}>
                        {s.label}
                      </span>
                    </div>

                    <p className="text-sm text-on-surface line-clamp-2">
                      {(o.items ?? []).map(i => `${i.qty}× ${i.item_name}`).join(' · ') || '—'}
                    </p>

                    <div className="mt-3 pt-3 border-t border-outline-variant/20 flex items-center justify-between text-sm">
                      <span className="text-on-surface-variant inline-flex items-center gap-1.5">
                        <Icon name="schedule" size={14} />
                        {formatAge(ageMin)}
                      </span>
                      <span className="font-bold text-on-surface">{inr(Number(o.total))}</span>
                    </div>

                    {o.status === 'completed' && (
                      <div
                        onClick={(e) => { e.stopPropagation(); reorder(o.code); }}
                        className="mt-3 -mb-1 inline-flex items-center gap-2 text-primary text-label-sm font-semibold"
                      >
                        <Icon name="refresh" size={14} />
                        Reorder
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function formatAge(min: number): string {
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)}h ago`;
  return `${Math.floor(min / 1440)}d ago`;
}
