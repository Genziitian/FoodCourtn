import type { OrderStatus, PaymentStatus } from '@foodcourt/shared';
import { cls, statusLabel } from '@foodcourt/shared';

const ORDER_STYLE: Record<OrderStatus, { bg: string; dot: string }> = {
  received:  { bg: 'bg-blue-50 text-blue-700',       dot: 'bg-blue-500' },
  preparing: { bg: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-500' },
  ready:     { bg: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  completed: { bg: 'bg-slate-100 text-slate-700',    dot: 'bg-slate-500' },
  cancelled: { bg: 'bg-rose-50 text-rose-700',       dot: 'bg-rose-500' },
};

const PAYMENT_STYLE: Record<PaymentStatus, { bg: string; label: string }> = {
  success:  { bg: 'bg-emerald-50 text-emerald-700', label: 'Paid' },
  pending:  { bg: 'bg-amber-50 text-amber-700',     label: 'Pending' },
  failed:   { bg: 'bg-rose-50 text-rose-700',       label: 'Failed' },
  refunded: { bg: 'bg-slate-100 text-slate-700',    label: 'Refunded' },
  counter:  { bg: 'bg-blue-50 text-blue-700',       label: 'At Counter' },
};

/**
 * Status pill for orders. Pass `orderType` (dine_in / takeaway / delivery)
 * so the visible label matches the flow — e.g. `ready` reads as "Prepared"
 * for takeaway and "Out for Delivery" for delivery.
 */
export function OrderStatusPill({
  status, orderType,
}: { status: OrderStatus; orderType?: 'dine_in' | 'takeaway' | 'delivery' | string | null }) {
  const s = ORDER_STYLE[status];
  return (
    <span className={cls('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', s.bg)}>
      <span className={cls('size-1.5 rounded-full', s.dot)} />
      {statusLabel(orderType, status)}
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

export function TypePill({ type }: { type: 'dine_in' | 'takeaway' | 'delivery' | string }) {
  const meta =
    type === 'dine_in'  ? { label: 'Dine-in',  cls: 'bg-brand-50 text-brand-700' }
    : type === 'delivery' ? { label: 'Delivery', cls: 'bg-blue-50 text-blue-700' }
    : { label: 'Takeaway', cls: 'bg-purple-50 text-purple-700' };
  return (
    <span className={cls(
      'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
      meta.cls,
    )}>
      {meta.label}
    </span>
  );
}
