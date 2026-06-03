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
