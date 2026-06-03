// React hooks layer — wraps the api.ts queries.
// Supabase is the single source of truth. No mock fallback.

import { useEffect, useState } from 'react';
import type {
  Category, Coupon, MenuItem, Order, OrderType, PriceBreakdown, Restaurant,
} from '@foodcourt/shared';
import {
  getCoupons, getMenu, getOrderByCode, getOrdersByCustomer, getRestaurantBySlug,
  getTableByToken, placeOrderRow, placeOrderViaEdgeFn, subscribeToOrder,
} from './api';

export function useRestaurant(slug: string) {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRestaurantBySlug(slug)
      .then(r => { if (!cancelled) { setRestaurant(r); setError(null); } })
      .catch(e => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  return { restaurant, loading, error };
}

export function useTable(restaurantId: string | undefined, qrToken: string | undefined) {
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableLabel, setTableLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId || !qrToken) { setTableId(null); setTableLabel(null); return; }
    let cancelled = false;
    getTableByToken(restaurantId, qrToken)
      .then(t => {
        if (cancelled) return;
        setTableId(t?.id ?? null);
        setTableLabel(t?.label ?? null);
      })
      .catch(() => { /* table not found is fine — fall back to takeaway */ });
    return () => { cancelled = true; };
  }, [restaurantId, qrToken]);

  return { tableId, tableLabel };
}

export function useMenu(restaurantId: string | undefined) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    setLoading(true);
    getMenu(restaurantId)
      .then(({ categories, items }) => {
        if (cancelled) return;
        setCategories(categories);
        setItems(items);
      })
      .catch(e => { console.error('useMenu error:', e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  return { categories, items, loading };
}

export function useCoupons(restaurantId: string | undefined) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    getCoupons(restaurantId)
      .then(c => { if (!cancelled) setCoupons(c); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [restaurantId]);
  return coupons;
}

// ────────────────────────────────────────────────────────────
// Place order (real Supabase insert)
// ────────────────────────────────────────────────────────────

export interface PlaceOrderArgs {
  restaurant_id: string;
  table_id: string | null;
  table_label: string | null;
  customer_id: string;
  order_type: OrderType;
  cart: import('@foodcourt/shared').Cart;
  breakdown: PriceBreakdown;
  customer_notes?: string;
}

/**
 * Place an order.
 *
 * Production path: calls the `place-order` Edge Function, which recomputes
 * pricing server-side and rejects tampered carts. The client-supplied
 * `breakdown` is sent only for display reconciliation — the server returns
 * its own authoritative breakdown which we use for the rest of the flow.
 *
 * Dev fallback: if the Edge Function isn't deployed (404 / "not found"),
 * we fall back to the legacy direct INSERT so local development still
 * works without `supabase functions deploy place-order` first.
 */
export async function placeOrder(args: PlaceOrderArgs): Promise<Order> {
  const result = await placeOrderViaEdgeFn({
    restaurant_id: args.restaurant_id,
    table_id: args.table_id,
    customer_id: args.customer_id,
    order_type: args.order_type,
    cart: args.cart,
    customer_notes: args.customer_notes,
  });

  if (result.ok) return result.order;

  // The function returned an explicit business error (out of stock, bad coupon,
  // etc.) — bubble it up. We only fall back on infrastructure misses.
  const isDeployMiss = /not found|404|Function not found|not deployed|unreachable|threw/i.test(result.error);
  if (!isDeployMiss) {
    throw new Error(result.error);
  }

  console.info(
    '[placeOrder] place-order Edge Function not available — falling back to direct insert. ' +
    'Deploy with: supabase functions deploy place-order --no-verify-jwt',
  );
  return placeOrderRow({
    restaurant_id: args.restaurant_id,
    table_id: args.table_id,
    customer_id: args.customer_id,
    order_type: args.order_type,
    cart: args.cart,
    breakdown: args.breakdown,
    customer_notes: args.customer_notes,
  });
}

// ────────────────────────────────────────────────────────────
// Live order tracking
// ────────────────────────────────────────────────────────────

export function useOrder(code: string | undefined) {
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const fetched = await getOrderByCode(code);
        if (cancelled) return;
        setOrder(fetched);

        if (fetched?.id) {
          unsubscribe = subscribeToOrder(fetched.id, (patch) => {
            setOrder(prev => prev ? { ...prev, ...patch } : prev);
            // re-fetch full order on every status change so status_events stay fresh
            if ('status' in patch) {
              getOrderByCode(code).then(updated => {
                if (!cancelled && updated) setOrder(updated);
              }).catch(() => { /* ignore */ });
            }
          });
        }
      } catch (e) {
        console.error('useOrder error:', e);
      }
    })();

    return () => { cancelled = true; unsubscribe?.(); };
  }, [code]);

  return order;
}

export function useOrderHistory(customerId: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    setLoading(true);
    getOrdersByCustomer(customerId)
      .then(os => { if (!cancelled) setOrders(os); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId]);

  return { orders, loading };
}
