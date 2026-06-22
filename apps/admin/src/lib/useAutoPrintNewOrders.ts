// useAutoPrintNewOrders — subscribes to realtime order INSERTs for the
// branches the current admin is scoped to and fires the chef KOT + customer
// bill the moment a new order lands.
//
// The "should I auto-print?" preference is per-DEVICE (localStorage), not
// per-restaurant. A single restaurant may have multiple stations open at
// once — only the cashier counter wants the customer bill, only the
// kitchen station wants the chef KOT. Toggling per-device lets each
// station pick its own behaviour.
//
// We dedupe via a small in-memory Set so a brief re-mount or a retry from
// supabase-realtime doesn't trigger duplicate prints.

import { useEffect, useRef } from 'react';
import { subscribeToOrders, supabase } from './api';
import type { BranchRow } from './api';
import { printKot, type KotPrintKind } from './printKot';

const STORAGE_KEY = 'fc:admin:autoPrintMode';
export type AutoPrintMode = 'off' | 'chef' | 'customer' | 'both';

export function getAutoPrintMode(): AutoPrintMode {
  if (typeof window === 'undefined') return 'off';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) as AutoPrintMode | null;
    return raw === 'chef' || raw === 'customer' || raw === 'both' ? raw : 'off';
  } catch {
    return 'off';
  }
}

export function setAutoPrintMode(mode: AutoPrintMode) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('fc-autoprint-changed', { detail: mode })); } catch { /* ignore */ }
}

/**
 * Subscribes once for the given restaurant ids. The hook is safe to mount
 * on multiple pages (KDS + Orders) — the dedupe Set guards against any
 * double-fires.
 */
export function useAutoPrintNewOrders(
  restaurantIds: string[],
  branches: BranchRow[],
) {
  const printedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!restaurantIds.length) return;

    const printForOrder = async (orderId: string) => {
      const mode = getAutoPrintMode();
      if (mode === 'off') return;
      if (printedRef.current.has(orderId)) return;
      printedRef.current.add(orderId);
      // Cap the Set so it doesn't grow unbounded on a long-running KDS shift.
      if (printedRef.current.size > 500) printedRef.current = new Set([...printedRef.current].slice(-250));

      // Fetch full order + items + customer + table from Supabase. Reuses
      // the same shape Orders.tsx renders.
      if (!supabase) return;
      const { data: row, error } = await supabase
        .from('orders')
        .select(`
          id, code, restaurant_id, type, status,
          subtotal, discount, total, payment_status, customer_notes, created_at,
          table:dining_tables(label),
          customer:customers(name, phone),
          items:order_items(id, item_name, variant_name, qty, notes, unit_price, line_total)
        `)
        .eq('id', orderId)
        .single();
      if (error || !row) return;

      const branch = branches.find(b => b.id === (row as any).restaurant_id);
      const kind: KotPrintKind = mode;

      void printKot({
        ticket_no: (row as any).code,
        order_code: (row as any).code,
        order_type: (row as any).type,
        table_label: (row as any).table?.label ?? null,
        customer_name: (row as any).customer?.name ?? null,
        customer_phone: (row as any).customer?.phone ?? null,
        created_at: (row as any).created_at,
        items: ((row as any).items ?? []).map((it: any) => ({
          name: it.item_name,
          variant: it.variant_name ?? null,
          modifiers: [],
          qty: it.qty,
          notes: it.notes ?? null,
          unit_price: it.unit_price != null ? Number(it.unit_price) : null,
          line_total: it.line_total != null ? Number(it.line_total) : null,
        })),
        restaurant: branch ? {
          name:    (branch as any).name    ?? null,
          phone:   (branch as any).phone   ?? null,
          address: (branch as any).address ?? null,
          logo_url:(branch as any).logo_url?? null,
          gstin:   (branch as any).gstin   ?? null,
        } : undefined,
        totals: {
          subtotal:       Number((row as any).subtotal ?? 0),
          discount:       Number((row as any).discount ?? 0),
          total:          Number((row as any).total ?? 0),
          payment_status: (row as any).payment_status,
        },
      }, kind);
    };

    const unsub = subscribeToOrders(restaurantIds, (evt) => {
      if (evt.type === 'insert') void printForOrder(evt.row.id);
    });
    return unsub;
    // join the ids into a stable key so we don't resubscribe on array re-creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantIds.join('|'), branches.map(b => b.id).join('|')]);
}
