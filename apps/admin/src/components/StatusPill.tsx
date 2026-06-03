import type { OrderStatus, PaymentStatus } from '@foodcourt/shared';
import { cls } from '@foodcourt/shared';

const ORDER_STYLE: Record<OrderStatus, { bg: string; dot: string; label: string }> = {
  received:  { bg: 'bg-blue-50 text-blue-700',       dot: 'bg-blue-500',    label: 'Received' },
  preparing: { bg: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500',   label: 'Preparing' },
  ready:     { bg: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Ready' },
  completed: { bg: 'bg-slate-100 text-slate-700',    dot: 'bg-slate-500',   label: 'Completed' },
  cancelled: { bg: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500',    label: 'Cancelled' },
};

const PAYMENT_STYLE: Record<PaymentStatus, { bg: string; label: string }> = {
  success:  { bg: 'bg-emerald-50 text-emerald-700', label: 'Paid' },
  pending:  { bg: 'bg-amber-50 text-amber-700',     label: 'Pending' },
  failed:   { bg: 'bg-rose-50 text-rose-700',       label: 'Failed' },
  refunded: { bg: 'bg-slate-100 text-slate-700',    label: 'Refunded' },
  counter:  { bg: 'bg-blue-50 text-blue-700',       label: 'At Counter' },
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const s = ORDER_STYLE[status];
  return (
    <span className={cls('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', s.bg)}>
      <span className={cls('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  const s = PAYMENT_STYLE[status];
  return (
    <span className={cls('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', s.bg)}>
      {s.label}
    </span>
  );
}

export function TypePill({ type }: { type: 'dine_in' | 'takeaway' }) {
  return (
    <span className={cls(
      'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
      type === 'dine_in' ? 'bg-brand-50 text-brand-700' : 'bg-purple-50 text-purple-700',
    )}>
      {type === 'dine_in' ? 'Dine-in' : 'Takeaway'}
    </span>
  );
}
