import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Cart, CartLine, OrderType } from '@foodcourt/shared';
import { uuid } from '@foodcourt/shared';

interface CartStore {
  cart: Cart;
  // Local-only flag: was the auto-applied coupon dismissed by the user?
  // Persisted alongside the cart so a refresh respects their choice.
  coupon_dismissed: boolean;
  init: (restaurantId: string, tableId: string | null) => void;
  setOrderType: (t: OrderType) => void;
  addLine: (line: Omit<CartLine, 'line_id' | 'line_total'>) => void;
  incLine: (lineId: string) => void;
  decLine: (lineId: string) => void;
  removeLine: (lineId: string) => void;
  setCoupon: (code: string | null) => void;
  toggleCoins: (v?: boolean) => void;
  clear: () => void;
}

const emptyCart: Cart = {
  restaurant_id: '',
  table_id: null,
  order_type: 'dine_in',
  lines: [],
  coupon_code: null,
  use_coins: false,
};

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      cart: emptyCart,
      coupon_dismissed: false,
      init: (restaurantId, tableId) => {
        const c = get().cart;
        // reset if switching restaurants
        if (c.restaurant_id && c.restaurant_id !== restaurantId) {
          set({
            cart: { ...emptyCart, restaurant_id: restaurantId, table_id: tableId, order_type: tableId ? 'dine_in' : 'takeaway' },
            coupon_dismissed: false,
          });
          return;
        }
        set({
          cart: {
            ...c,
            restaurant_id: restaurantId,
            table_id: tableId,
            order_type: c.lines.length > 0 ? c.order_type : (tableId ? 'dine_in' : 'takeaway'),
          },
        });
      },
      setOrderType: (t) => set(s => ({ cart: { ...s.cart, order_type: t } })),
      addLine: (line) => set(s => {
        const lineTotal = line.unit_price * line.qty;
        return {
          cart: {
            ...s.cart,
            lines: [
              ...s.cart.lines,
              { ...line, line_id: uuid(), line_total: lineTotal },
            ],
          },
        };
      }),
      incLine: (lineId) => set(s => ({
        cart: {
          ...s.cart,
          lines: s.cart.lines.map(l =>
            l.line_id === lineId
              ? { ...l, qty: l.qty + 1, line_total: (l.qty + 1) * l.unit_price }
              : l,
          ),
        },
      })),
      decLine: (lineId) => set(s => ({
        cart: {
          ...s.cart,
          lines: s.cart.lines
            .map(l =>
              l.line_id === lineId
                ? { ...l, qty: l.qty - 1, line_total: (l.qty - 1) * l.unit_price }
                : l,
            )
            .filter(l => l.qty > 0),
        },
      })),
      removeLine: (lineId) => set(s => ({
        cart: { ...s.cart, lines: s.cart.lines.filter(l => l.line_id !== lineId) },
      })),
      setCoupon: (code) => set(s => ({
        cart: { ...s.cart, coupon_code: code },
        // If user actively removed (code === null), remember so we don't re-apply.
        // If user actively applied a code, the dismissal is moot — reset it so the
        // next time they remove they get a clean state.
        coupon_dismissed: code === null ? true : false,
      })),
      toggleCoins: (v) => set(s => ({ cart: { ...s.cart, use_coins: v ?? !s.cart.use_coins } })),
      clear: () => set(s => ({
        cart: { ...emptyCart, restaurant_id: s.cart.restaurant_id, table_id: s.cart.table_id, order_type: s.cart.order_type },
        coupon_dismissed: false,
      })),
    }),
    { name: 'foodcourt-cart-v1' },
  ),
);
