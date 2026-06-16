// All Supabase queries for the customer app live here.
// Hooks in lib/data.ts compose these into React state.

import {
  getSupabase,
  type Cart,
  type Category,
  type Coupon,
  type MenuItem,
  type MenuModifier,
  type MenuVariant,
  type Order,
  type OrderType,
  type PriceBreakdown,
  type Restaurant,
} from '@foodcourt/shared';
import { env } from './env';

export const supabase = getSupabase(env);

if (!supabase) {
  // Surface a clear error early. The app needs Supabase to function.
  // eslint-disable-next-line no-console
  console.error('Supabase env missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

function client() {
  if (!supabase) throw new Error('Supabase client not configured');
  return supabase;
}

// ────────────────────────────────────────────────────────────
// Restaurant + table
// ────────────────────────────────────────────────────────────

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const { data, error } = await client()
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as Restaurant | null;
}

export async function getTableByToken(restaurantId: string, qrToken: string) {
  const { data, error } = await client()
    .from('dining_tables')
    .select('id, label, qr_token, restaurant_id, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('qr_token', qrToken)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * For single-QR mode: list active tables so the customer can pick one from a
 * dropdown after scanning the branch QR.
 */
export async function listActiveTables(restaurantId: string) {
  const { data, error } = await client()
    .from('dining_tables')
    .select('id, label, qr_token, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('label');
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; label: string; qr_token: string; is_active: boolean }>;
}

// ────────────────────────────────────────────────────────────
// Menu
// ────────────────────────────────────────────────────────────

export async function getMenu(restaurantId: string): Promise<{ categories: Category[]; items: MenuItem[] }> {
  const [cats, items, variants, modifiers] = await Promise.all([
    client()
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }),
    client()
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true }),
    client()
      .from('menu_variants')
      .select('*'),
    client()
      .from('menu_modifiers')
      .select('*'),
  ]);
  if (cats.error) throw cats.error;
  if (items.error) throw items.error;
  if (variants.error) throw variants.error;
  if (modifiers.error) throw modifiers.error;

  const variantsByItem = new Map<string, MenuVariant[]>();
  (variants.data ?? []).forEach((v: any) => {
    const arr = variantsByItem.get(v.menu_item_id) ?? [];
    arr.push(v as MenuVariant);
    variantsByItem.set(v.menu_item_id, arr);
  });
  const modsByItem = new Map<string, MenuModifier[]>();
  (modifiers.data ?? []).forEach((m: any) => {
    const arr = modsByItem.get(m.menu_item_id) ?? [];
    arr.push(m as MenuModifier);
    modsByItem.set(m.menu_item_id, arr);
  });

  const fullItems: MenuItem[] = (items.data ?? []).map((i: any) => ({
    ...i,
    // schema doesn't have these yet — provide safe defaults
    mrp: i.mrp ?? null,
    parcel_charge:   i.parcel_charge   != null ? Number(i.parcel_charge)   : 0,
    delivery_charge: i.delivery_charge != null ? Number(i.delivery_charge) : 0,
    is_combo:        !!i.is_combo,
    prep_time_min: i.prep_time_min ?? 15,
    is_chef_special: i.is_chef_special ?? false,
    spice_levels: i.spice_levels ?? [],
    default_spice_level: i.default_spice_level ?? null,
    variants: variantsByItem.get(i.id),
    modifiers: modsByItem.get(i.id),
  }));

  return {
    categories: (cats.data ?? []) as Category[],
    items: fullItems,
  };
}

export async function getCoupons(restaurantId: string): Promise<Coupon[]> {
  const { data, error } = await client()
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as Coupon[];
}

/**
 * Map of coupon_id → number of times THIS customer has redeemed that coupon
 * (excluding cancelled orders). Used to enforce per_user_limit at apply time
 * so a one-time-use coupon doesn't auto-apply on the customer's second order.
 */
export async function getCustomerCouponUsage(customerId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!customerId) return out;
  const { data, error } = await client()
    .from('orders')
    .select('coupon_id, status')
    .eq('customer_id', customerId)
    .not('coupon_id', 'is', null);
  if (error) return out;        // best-effort: don't block checkout on this
  (data ?? []).forEach((r: any) => {
    if (!r.coupon_id || r.status === 'cancelled') return;
    out.set(r.coupon_id, (out.get(r.coupon_id) ?? 0) + 1);
  });
  return out;
}

// ────────────────────────────────────────────────────────────
// Orders — place + read + realtime
// ────────────────────────────────────────────────────────────

export interface PlaceOrderInput {
  restaurant_id: string;
  table_id: string | null;
  customer_id: string | null;
  order_type: OrderType;
  cart: Cart;
  breakdown: PriceBreakdown;
  customer_notes?: string;
}

/**
 * Server-side order placement via the `place-order` Edge Function.
 *
 * The Edge Function recomputes price from the DB, ignores any client-supplied
 * unit_price / breakdown, and only writes the order if everything still
 * adds up. This is the path we want in production — direct insert
 * (placeOrderRow below) is kept as a dev fallback for when the Edge Function
 * isn't deployed yet.
 *
 * On any 4xx/5xx response the function returns ok:false and the caller
 * should fall back to the client-side path (only in dev) or surface the
 * error to the user.
 */
export async function placeOrderViaEdgeFn(input: {
  restaurant_id: string;
  table_id: string | null;
  customer_id: string | null;
  order_type: OrderType;
  cart: any;
  customer_notes?: string;
}): Promise<{ ok: true; order: Order } | { ok: false; error: string; status?: number }> {
  if (!supabase) return { ok: false, error: 'Supabase client not configured' };
  try {
    const { data, error } = await supabase.functions.invoke('place-order', { body: input });
    if (error) {
      // supabase-js wraps non-2xx responses here. Try to surface the JSON body's error.
      const message = (error as any)?.context?.error?.message
        ?? (data as any)?.error
        ?? error.message
        ?? 'place-order call failed';
      return { ok: false, error: String(message) };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? 'place-order rejected the request' };
    return { ok: true, order: data.order as Order };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'place-order threw' };
  }
}

export async function placeOrderRow(input: PlaceOrderInput): Promise<Order> {
  const c = client();

  // 0) Ensure customer row exists for FK
  if (input.customer_id) {
    const up = await c.from('customers').upsert({ id: input.customer_id }, { onConflict: 'id' });
    if (up.error) {
      // not fatal — just means we lose the customer linkage. Drop the FK link.
      console.warn('customer upsert failed, placing order anonymously:', up.error);
      input.customer_id = null;
    }
  }

  // 1) Insert order row
  const orderInsert = await c
    .from('orders')
    .insert({
      restaurant_id: input.restaurant_id,
      table_id: input.table_id,
      customer_id: input.customer_id,
      type: input.order_type,
      status: 'received',
      subtotal: input.breakdown.subtotal,
      tax: input.breakdown.tax,
      service_charge: input.breakdown.service_charge,
      packing_charge: input.breakdown.packing_charge,
      discount: input.breakdown.discount,
      coins_redeemed: input.breakdown.coins_redeemed,
      coins_value: input.breakdown.coins_value,
      total: input.breakdown.total,
      coupon_id: input.breakdown.applied_coupon?.id ?? null,
      payment_status: 'success',           // demo flow assumes paid; real flow flips this in webhook
      customer_notes: input.customer_notes ?? null,
      estimated_min: 12,
      estimated_max: 15,
    })
    .select('*')
    .single();

  if (orderInsert.error) throw orderInsert.error;
  const order = orderInsert.data as Order;

  // 2) Insert items
  const itemRows = input.cart.lines.map(line => ({
    order_id: order.id,
    menu_item_id: line.menu_item_id,
    variant_id: line.variant_id,
    item_name: line.item_name,
    variant_name: line.variant_name,
    modifiers: line.modifiers,
    qty: line.qty,
    unit_price: line.unit_price,
    line_total: line.line_total,
    notes: [line.spice_level && `${line.spice_level} spicy`, line.notes].filter(Boolean).join(' · ') || null,
  }));
  const itemsInsert = await c.from('order_items').insert(itemRows);
  if (itemsInsert.error) throw itemsInsert.error;

  // 3) Insert KOT ticket for the kitchen pipeline.
  //    RLS allows this because the staff side reads; insert here uses the
  //    permissive policy we added in seed_extras (TODO: tighten with Edge Fn).
  const ticketNo = 'KOT-' + Math.floor(Math.random() * 9000 + 1000);
  const kotInsert = await c.from('kot_tickets').insert({
    restaurant_id: input.restaurant_id,
    order_id: order.id,
    ticket_no: ticketNo,
    station: 'all',
    status: 'new',
    is_rush: false,
    items_done: 0,
    items_total: input.cart.lines.reduce((s, l) => s + l.qty, 0),
    payload: {
      order_code: order.code,
      order_type: input.order_type,
      table_label: null,
      customer_name: null,
      items: input.cart.lines.map(l => ({
        id: l.line_id,
        name: l.item_name,
        variant: l.variant_name,
        modifiers: l.modifiers.map(m => m.name),
        qty: l.qty,
      })),
    },
  });
  if (kotInsert.error) {
    // KOT insert failure isn't fatal for the customer — log + continue
    console.warn('KOT insert failed (non-fatal):', kotInsert.error);
  }

  return order;
}

export async function getOrderByCode(code: string): Promise<Order | null> {
  const { data, error } = await client()
    .from('orders')
    .select('*, status_events:order_status_events(*), items:order_items(*)')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data as Order | null;
}

/**
 * Subscribe to live updates on a single order (status changes).
 * Returns an unsubscribe function.
 */
export function subscribeToOrder(orderId: string, onUpdate: (o: Partial<Order>) => void) {
  const c = client();
  const channel = c
    .channel(`order:${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      (payload) => onUpdate(payload.new as Partial<Order>),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'order_status_events', filter: `order_id=eq.${orderId}` },
      (payload) => onUpdate({ status: (payload.new as any).status }),
    )
    .subscribe();
  return () => { c.removeChannel(channel); };
}

// ────────────────────────────────────────────────────────────
// Order history (for profile)
// ────────────────────────────────────────────────────────────

export async function getOrdersByCustomer(customerId: string): Promise<Order[]> {
  const { data, error } = await client()
    .from('orders')
    .select('*, items:order_items(*), table:dining_tables(label)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    table_label: r.table?.label ?? null,
  })) as Order[];
}

// ────────────────────────────────────────────────────────────
// Customer profile (one row per browser identity, no real auth)
// ────────────────────────────────────────────────────────────

export async function upsertCustomer(input: {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}) {
  const c = client();
  const { data, error } = await c
    .from('customers')
    .upsert({
      id: input.id,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
    }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ────────────────────────────────────────────────────────────
// OTP via 2factor.in (Supabase Edge Functions)
// ────────────────────────────────────────────────────────────

/**
 * Trigger 2factor.in to send an OTP to the given phone. The Edge Function
 * normalises +91XXXXXXXXXX format and uses AUTOGEN — 2factor generates the OTP
 * and texts it to the user. No session_id needs to be tracked on our side;
 * VERIFY3 (in verifyOtpRequest) checks against the most recent OTP for that
 * phone number.
 *
 * Returns ok:true on send. On failure, returns ok:false with a human-readable
 * error from 2factor.in.
 */
export async function sendOtpRequest(phone: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase client not configured' };
  try {
    const { data, error } = await supabase.functions.invoke('send-otp', {
      body: { phone },
    });
    if (error) return { ok: false, error: error.message };
    if (data?.ok === false) return { ok: false, error: data.error ?? 'Send failed' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'send-otp threw' };
  }
}

export async function verifyOtpRequest(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase client not configured' };
  try {
    const { data, error } = await supabase.functions.invoke('verify-otp', {
      body: { phone, code },
    });
    if (error) return { ok: false, error: error.message };
    if (data?.ok === true) return { ok: true };
    return { ok: false, error: data?.error ?? 'Verification failed' };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'verify-otp threw' };
  }
}

export async function getCustomer(id: string) {
  const { data, error } = await client()
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ────────────────────────────────────────────────────────────
// Loyalty (FoodCoins) — wallet is per (restaurant, customer).
// The Profile screen shows the sum across all wallets so the customer
// sees one "total coins" number; FoodCoins page can break it down later.
// ────────────────────────────────────────────────────────────

/**
 * Sum the customer's loyalty balance across every restaurant wallet they have.
 * Returns 0 if no wallet rows exist yet.
 */
export async function getLoyaltyBalance(customerId: string): Promise<number> {
  if (!customerId) return 0;
  try {
    const { data, error } = await client()
      .from('loyalty_wallets')
      .select('balance')
      .eq('customer_id', customerId);
    if (error) {
      console.warn('getLoyaltyBalance failed:', error.message);
      return 0;
    }
    return (data ?? []).reduce((sum: number, row: any) => sum + (row.balance ?? 0), 0);
  } catch (e: any) {
    console.warn('getLoyaltyBalance threw:', e?.message);
    return 0;
  }
}

/**
 * Award coins for a completed order. `earnRate` is "coins per ₹100 spent" from
 * the restaurant's settings — so a ₹500 order at rate 5 awards 25 coins.
 *
 * Upserts the (restaurant, customer) wallet row and records a transaction.
 * Returns the number of coins awarded (0 on any failure — we never want a
 * loyalty issue to block order placement, so all errors are swallowed).
 */
export async function awardOrderCoins(input: {
  restaurant_id: string;
  customer_id: string;
  order_id: string;
  order_total: number;
  earn_rate: number;
}): Promise<number> {
  const { restaurant_id, customer_id, order_id, order_total, earn_rate } = input;
  if (!restaurant_id || !customer_id || !order_id) return 0;
  if (!earn_rate || earn_rate <= 0) return 0;

  const coins = Math.floor((order_total / 100) * earn_rate);
  if (coins <= 0) return 0;

  const c = client();
  try {
    // 1. Find or create the wallet row.
    const { data: existing } = await c
      .from('loyalty_wallets')
      .select('id, balance')
      .eq('restaurant_id', restaurant_id)
      .eq('customer_id', customer_id)
      .maybeSingle();

    let walletId: string;
    let newBalance: number;
    if (existing) {
      walletId = existing.id as string;
      newBalance = (existing.balance ?? 0) + coins;
      const { error: updErr } = await c
        .from('loyalty_wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('id', walletId);
      if (updErr) throw updErr;
    } else {
      const { data: created, error: insErr } = await c
        .from('loyalty_wallets')
        .insert({ restaurant_id, customer_id, balance: coins })
        .select('id')
        .single();
      if (insErr) throw insErr;
      walletId = created.id as string;
      newBalance = coins;
    }

    // 2. Log the transaction so the customer's ledger has provenance.
    const { error: txnErr } = await c
      .from('loyalty_transactions')
      .insert({
        wallet_id: walletId,
        order_id,
        type: 'earn',
        points: coins,
      });
    if (txnErr) console.warn('Loyalty txn log failed (wallet still updated):', txnErr.message);

    return coins;
  } catch (e: any) {
    console.warn('awardOrderCoins failed:', e?.message);
    return 0;
  }
}

// ────────────────────────────────────────────────────────────
// Branch payment key (Razorpay) — fetched per-order
// ────────────────────────────────────────────────────────────

export interface BranchPaymentKey {
  provider: 'razorpay' | 'stripe' | 'phonepe' | 'paytm' | 'cashfree';
  key_id: string;
  test_mode: boolean;
}

/**
 * Returns the active payment key for a branch — or null if the branch
 * has no gateway configured OR the platform has disabled the provider.
 * Never returns the secret; only the public key_id.
 */
// ────────────────────────────────────────────────────────────
// Feedback (order rating)
// ────────────────────────────────────────────────────────────

export async function submitFeedback(input: {
  restaurant_id: string;
  order_id?: string | null;
  customer_id?: string | null;
  menu_item_id?: string | null;
  rating: number;
  comment?: string;
}) {
  const { error } = await client()
    .from('customer_feedback')
    .insert({
      restaurant_id: input.restaurant_id,
      order_id:      input.order_id ?? null,
      customer_id:   input.customer_id ?? null,
      menu_item_id:  input.menu_item_id ?? null,
      rating:        input.rating,
      comment:       input.comment ?? null,
      is_published:  true,
    });
  if (error) throw error;
}

export async function getBranchPaymentKey(restaurantId: string): Promise<BranchPaymentKey | null> {
  const { data, error } = await client()
    .rpc('get_branch_payment_key', { rid: restaurantId });
  if (error) {
    console.warn('get_branch_payment_key failed', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    provider: row.provider,
    key_id: row.key_id,
    test_mode: row.test_mode,
  };
}

// ────────────────────────────────────────────────────────────
// Customer addresses
// ────────────────────────────────────────────────────────────

export interface AddressRow {
  id: string;
  customer_id: string;
  label: string;
  recipient: string | null;
  phone: string | null;
  address_line: string;
  locality: string | null;
  city: string | null;
  pincode: string | null;
  landmark: string | null;
  is_default: boolean;
}

export async function listAddresses(customerId: string): Promise<AddressRow[]> {
  const { data, error } = await client()
    .from('customer_addresses')
    .select('id, customer_id, label, recipient, phone, address_line, locality, city, pincode, landmark, is_default')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('id');
  if (error) throw error;
  return (data ?? []) as AddressRow[];
}

export async function createAddress(input: Omit<AddressRow, 'id'>): Promise<AddressRow> {
  const c = client();
  if (input.is_default) {
    await c.from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', input.customer_id);
  }
  const { data, error } = await c
    .from('customer_addresses')
    .insert(input)
    .select('id, customer_id, label, recipient, phone, address_line, locality, city, pincode, landmark, is_default')
    .single();
  if (error) throw error;
  return data as AddressRow;
}

export async function updateAddress(id: string, customerId: string, patch: Partial<AddressRow>) {
  const c = client();
  if (patch.is_default) {
    await c.from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', customerId)
      .neq('id', id);
  }
  const { error } = await c.from('customer_addresses').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteAddress(id: string) {
  const { error } = await client().from('customer_addresses').delete().eq('id', id);
  if (error) throw error;
}
