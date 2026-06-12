// Design tokens shared across customer / admin / KDS apps.
// Mirrors the UI mockups: orange primary, green veg, red non-veg.

export const tokens = {
  primary: '#EA580C',        // orange-600
  primaryHover: '#C2410C',   // orange-700
  primarySoft: '#FED7AA',    // orange-200
  primaryTint: '#FFF7ED',    // orange-50
  veg: '#16A34A',            // green-600
  vegSoft: '#DCFCE7',        // green-100
  nonVeg: '#DC2626',         // red-600
  nonVegSoft: '#FEE2E2',     // red-100
  text: '#0F172A',           // slate-900
  textMuted: '#64748B',      // slate-500
  border: '#E2E8F0',         // slate-200
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',     // slate-50
  ratingBg: '#16A34A',
  // KDS dark theme
  kdsBg: '#0B0F19',
  kdsSurface: '#111827',
  kdsBorder: '#1F2937',
  kdsText: '#F9FAFB',
  kdsRush: '#DC2626',
};

export const STATUS_LABEL: Record<string, string> = {
  received: 'Order Received',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_SUBTITLE: Record<string, string> = {
  received: 'Your order has been confirmed',
  preparing: 'Kitchen is working on your order',
  ready: 'Your food is ready, please collect it',
  completed: 'Thanks for dining with us',
  cancelled: 'This order was cancelled',
};

/**
 * Per-order-type status labels.
 *
 * The underlying enum stays the same (`received | preparing | ready |
 * completed | cancelled`) — only the human label changes by order type.
 *
 *   dine_in:   Received → Preparing → Ready          → Completed
 *   takeaway:  Received → Preparing → Prepared       → Completed
 *   delivery:  Received → Preparing → Out for Delivery → Shipped
 *
 * Callers pass the order's `type` and `status`. Anything we don't know
 * falls back to the global `STATUS_LABEL` / `STATUS_SUBTITLE` above so
 * old callers keep working.
 */
type StatusKey = 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
type OrderTypeKey = 'dine_in' | 'takeaway' | 'delivery';

const PER_TYPE_LABEL: Record<OrderTypeKey, Partial<Record<StatusKey, string>>> = {
  dine_in: {
    ready: 'Ready',
    completed: 'Completed',
  },
  takeaway: {
    ready: 'Prepared',
    completed: 'Completed',
  },
  delivery: {
    ready: 'Out for Delivery',
    completed: 'Shipped',
  },
};

const PER_TYPE_SUBTITLE: Record<OrderTypeKey, Partial<Record<StatusKey, string>>> = {
  dine_in: {
    ready: 'Your food is ready, please collect it',
    completed: 'Thanks for dining with us',
  },
  takeaway: {
    ready: 'Your order is packed and ready for pickup',
    completed: 'Thanks for ordering — see you again soon',
  },
  delivery: {
    received: 'Order confirmed, prepping for delivery',
    ready: 'Driver is on the way',
    completed: 'Delivered. Thanks for ordering!',
  },
};

export function statusLabel(orderType: string | null | undefined, status: string): string {
  const t = (orderType ?? 'dine_in') as OrderTypeKey;
  return PER_TYPE_LABEL[t]?.[status as StatusKey] ?? STATUS_LABEL[status] ?? status;
}

export function statusSubtitle(orderType: string | null | undefined, status: string): string {
  const t = (orderType ?? 'dine_in') as OrderTypeKey;
  return PER_TYPE_SUBTITLE[t]?.[status as StatusKey] ?? STATUS_SUBTITLE[status] ?? '';
}
