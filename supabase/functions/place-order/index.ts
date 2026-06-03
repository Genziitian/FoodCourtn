// ════════════════════════════════════════════════════════════════════
// Edge Function: place-order
//
// Server-side order placement with authoritative price re-computation.
// Replaces the customer browser's direct INSERT into `orders` so a
// motivated attacker can't put a ₹10000 biryani in for ₹1.
//
// Flow:
//   1. Validate restaurant exists + is_open
//   2. Load menu_items + variants + modifiers from DB by id
//   3. Reprice every cart line from canonical DB prices (NOT client prices)
//   4. Re-evaluate the coupon against current DB state
//   5. Cap coin redemption by the customer's actual wallet balance
//   6. Re-run the same pricing formula the client uses
//   7. Upsert customer, INSERT order + items + KOT in one transaction-ish flow
//   8. Return the order with server-computed totals
//
// Inputs (POST JSON):
//   {
//     restaurant_id: uuid,
//     customer_id: uuid | null,
//     table_id: uuid | null,
//     order_type: 'dine_in' | 'takeaway',
//     cart: { lines: [...], coupon_code, use_coins, order_type },
//     customer_notes?: string
//   }
//
// Output: { ok: true, order: { id, code, total, ... } }
//      or { ok: false, error: "..." } with 4xx/5xx status
//
// Deploy:
//   supabase functions deploy place-order --no-verify-jwt
//
// `--no-verify-jwt` is on purpose: customers are anonymous (browser UUID,
// not Supabase Auth). Trust comes from SERVICE_ROLE inside the function
// re-pricing everything, NOT from JWT.
// ════════════════════════════════════════════════════════════════════

// @ts-ignore Deno-only
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore npm specifier (Deno native, no esm.sh fetch — avoids 10s bundling timeouts)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// ────────────────────────────────────────────────────────────
// Pricing — duplicates `packages/shared/src/pricing.ts` because
// Edge Functions can't import workspace packages. Keep these in
// sync. If a behavioural change lands client-side, mirror it here.
// ────────────────────────────────────────────────────────────
interface PricingInput {
  cart: any;
  settings: any;
  coupon: any | null;
  coinsAvailable: number;
}
function round2(n: number): number { return Math.round(n * 100) / 100; }

function calculatePrice({ cart, settings, coupon, coinsAvailable }: PricingInput) {
  const subtotal = cart.lines.reduce((s: number, l: any) => s + Number(l.line_total ?? 0), 0);

  let discount = 0;
  let appliedCoupon: any = null;
  if (coupon && coupon.is_active && subtotal >= Number(coupon.min_order_value ?? 0)
      && (coupon.applies_to ?? ['dine_in','takeaway']).includes(cart.order_type)) {
    if (coupon.type === 'percent' && coupon.value) {
      discount = (subtotal * Number(coupon.value)) / 100;
      if (coupon.max_discount) discount = Math.min(discount, Number(coupon.max_discount));
    } else if (coupon.type === 'flat' && coupon.value) {
      discount = Math.min(Number(coupon.value), subtotal);
    }
    if (discount > 0) appliedCoupon = coupon;
  }

  const afterDiscount = Math.max(0, subtotal - discount);

  let coinsRedeemed = 0;
  let coinsValue = 0;
  if (cart.use_coins && coinsAvailable > 0) {
    const cap = (afterDiscount * Number(settings.loyalty_max_redeem_percent ?? 0)) / 100;
    coinsValue = Math.min(coinsAvailable, Math.floor(cap));
    coinsRedeemed = coinsValue;
  }

  const taxable = Math.max(0, afterDiscount - coinsValue);
  const tax = settings.gst_inclusive ? 0 : (taxable * Number(settings.gst_percent ?? 0)) / 100;

  const serviceCharge = Number(settings.service_charge_percent ?? 0) > 0
    ? (taxable * Number(settings.service_charge_percent)) / 100 : 0;
  const packingCharge = cart.order_type === 'takeaway'
    ? Number(settings.packing_charge ?? 0) : 0;

  const total = round2(taxable + tax + serviceCharge + packingCharge);

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    coins_redeemed: coinsRedeemed,
    coins_value: round2(coinsValue),
    tax: round2(tax),
    service_charge: round2(serviceCharge),
    packing_charge: round2(packingCharge),
    total,
    applied_coupon: appliedCoupon,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")     return json({ ok: false, error: "Use POST" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "Server misconfigured: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" }, 500);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const restaurant_id  = body?.restaurant_id as string | undefined;
  const customer_id    = (body?.customer_id ?? null) as string | null;
  const table_id       = (body?.table_id ?? null) as string | null;
  const order_type     = body?.order_type as 'dine_in' | 'takeaway' | undefined;
  const cart           = body?.cart;
  const customer_notes = (body?.customer_notes ?? null) as string | null;

  if (!restaurant_id || !order_type || !cart || !Array.isArray(cart.lines) || cart.lines.length === 0) {
    return json({ ok: false, error: "restaurant_id, order_type and a non-empty cart are required" }, 400);
  }
  if (order_type !== 'dine_in' && order_type !== 'takeaway') {
    return json({ ok: false, error: "order_type must be 'dine_in' or 'takeaway'" }, 400);
  }
  // Coerce to the server's view of order_type so calculatePrice + downstream agree.
  cart.order_type = order_type;

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Restaurant must exist and be accepting orders.
  const { data: restaurant, error: rErr } = await db
    .from("restaurants")
    .select("id, slug, name, settings, is_open")
    .eq("id", restaurant_id)
    .maybeSingle();
  if (rErr) return json({ ok: false, error: rErr.message }, 500);
  if (!restaurant) return json({ ok: false, error: "Unknown restaurant" }, 404);
  if (restaurant.is_open === false) return json({ ok: false, error: "Restaurant is currently closed" }, 409);

  // 2. Load menu items in one shot to validate ids + reprice from DB.
  const itemIds = Array.from(new Set(cart.lines.map((l: any) => l.menu_item_id).filter(Boolean)));
  const variantIds = Array.from(new Set(cart.lines.map((l: any) => l.variant_id).filter(Boolean)));

  const [{ data: menuItems }, { data: variants }, { data: modifiers }] = await Promise.all([
    db.from("menu_items").select("id, name, base_price, in_stock, restaurant_id").in("id", itemIds as string[]),
    variantIds.length
      ? db.from("menu_variants").select("id, name, price, menu_item_id").in("id", variantIds as string[])
      : Promise.resolve({ data: [] as any[] }),
    db.from("menu_modifiers").select("id, name, price, menu_item_id"),
  ]);

  const itemById    = new Map<string, any>((menuItems    ?? []).map((m: any) => [m.id, m]));
  const variantById = new Map<string, any>((variants     ?? []).map((v: any) => [v.id, v]));
  const modifierById = new Map<string, any>((modifiers   ?? []).map((m: any) => [m.id, m]));

  // 3. Reprice each line from the DB. Reject lines that reference unknown ids
  //    or out-of-stock items; ignore client-supplied unit_price entirely.
  const repricedLines: any[] = [];
  for (const line of cart.lines) {
    const item = itemById.get(line.menu_item_id);
    if (!item) return json({ ok: false, error: `Unknown menu item: ${line.menu_item_id}` }, 422);
    if (item.restaurant_id !== restaurant_id) {
      return json({ ok: false, error: `Item ${item.name} doesn't belong to this restaurant` }, 422);
    }
    if (item.in_stock === false) {
      return json({ ok: false, error: `${item.name} is out of stock` }, 409);
    }

    // Unit price: variant overrides base_price.
    let unit_price = Number(item.base_price);
    if (line.variant_id) {
      const v = variantById.get(line.variant_id);
      if (!v || v.menu_item_id !== item.id) {
        return json({ ok: false, error: `Invalid variant for ${item.name}` }, 422);
      }
      unit_price = Number(v.price);
    }

    // Modifier add-ons — only accept rows the DB knows about, and that
    // belong to the same item.
    const cleanMods: Array<{ id: string; name: string; price: number }> = [];
    for (const m of (line.modifiers ?? [])) {
      const known = modifierById.get(m.id);
      if (!known || known.menu_item_id !== item.id) continue;
      cleanMods.push({ id: known.id, name: known.name, price: Number(known.price) });
      unit_price += Number(known.price);
    }

    const qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    const line_total = round2(unit_price * qty);

    repricedLines.push({
      menu_item_id: item.id,
      variant_id:   line.variant_id ?? null,
      item_name:    item.name,
      variant_name: line.variant_id ? (variantById.get(line.variant_id)?.name ?? null) : null,
      modifiers:    cleanMods,
      qty,
      unit_price:   round2(unit_price),
      line_total,
      spice_level:  line.spice_level ?? null,
      notes:        line.notes ?? null,
      line_id:      line.line_id,
    });
  }

  // 4. Coupon: only accept it if it's actually active + valid right now.
  let coupon: any = null;
  if (cart.coupon_code) {
    const { data: c } = await db
      .from("coupons")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .ilike("code", cart.coupon_code)
      .eq("is_active", true)
      .maybeSingle();
    if (c) {
      const now = new Date();
      const validFromOk = !c.valid_from || new Date(c.valid_from) <= now;
      const validToOk   = !c.valid_to   || new Date(c.valid_to)   >= now;
      const usageOk     = !c.usage_limit || (Number(c.used_count) < Number(c.usage_limit));
      if (validFromOk && validToOk && usageOk) coupon = c;
    }
  }

  // 5. Coin balance: customer can only redeem what they actually have for
  //    THIS restaurant. Wallets are per (restaurant, customer).
  let coinsAvailable = 0;
  if (customer_id && cart.use_coins) {
    const { data: wallet } = await db
      .from("loyalty_wallets")
      .select("balance")
      .eq("customer_id", customer_id)
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();
    coinsAvailable = Number(wallet?.balance ?? 0);
  }

  // 6. Recompute the canonical price.
  const repricedCart = { ...cart, lines: repricedLines, order_type };
  const breakdown = calculatePrice({
    cart: repricedCart,
    settings: restaurant.settings ?? {},
    coupon,
    coinsAvailable,
  });

  // 7. Upsert customer row (so the FK on orders.customer_id is satisfiable).
  let finalCustomerId = customer_id;
  if (customer_id) {
    const up = await db.from("customers").upsert({ id: customer_id }, { onConflict: "id" });
    if (up.error) {
      console.warn("customer upsert failed; placing order without FK link:", up.error.message);
      finalCustomerId = null;
    }
  }

  // 8. Insert the order.
  const { data: orderRow, error: oErr } = await db
    .from("orders")
    .insert({
      restaurant_id,
      table_id,
      customer_id: finalCustomerId,
      type: order_type,
      status: "received",
      subtotal:        breakdown.subtotal,
      tax:             breakdown.tax,
      service_charge:  breakdown.service_charge,
      packing_charge:  breakdown.packing_charge,
      discount:        breakdown.discount,
      coins_redeemed:  breakdown.coins_redeemed,
      coins_value:     breakdown.coins_value,
      total:           breakdown.total,
      coupon_id:       breakdown.applied_coupon?.id ?? null,
      // payment_status starts pending — the razorpay-webhook flips it to 'success'.
      // For counter / cash flows the admin can mark paid manually.
      payment_status:  "pending",
      customer_notes,
      estimated_min: 12,
      estimated_max: 15,
    })
    .select("*")
    .single();

  if (oErr || !orderRow) return json({ ok: false, error: oErr?.message ?? "Order insert failed" }, 500);

  // 9. Insert items.
  const itemRows = repricedLines.map((l: any) => ({
    order_id:     orderRow.id,
    menu_item_id: l.menu_item_id,
    variant_id:   l.variant_id,
    item_name:    l.item_name,
    variant_name: l.variant_name,
    modifiers:    l.modifiers,
    qty:          l.qty,
    unit_price:   l.unit_price,
    line_total:   l.line_total,
    notes:        [l.spice_level && `${l.spice_level} spicy`, l.notes].filter(Boolean).join(" · ") || null,
  }));
  const { error: iErr } = await db.from("order_items").insert(itemRows);
  if (iErr) {
    // Order row exists but items failed — surface the error so the customer doesn't see a half-baked tracking page.
    return json({ ok: false, error: `Order items insert failed: ${iErr.message}`, order_id: orderRow.id }, 500);
  }

  // 10. KOT for the kitchen.
  const ticketNo = "KOT-" + Math.floor(Math.random() * 9000 + 1000);
  const { error: kErr } = await db.from("kot_tickets").insert({
    restaurant_id,
    order_id: orderRow.id,
    ticket_no: ticketNo,
    station: "all",
    status: "new",
    is_rush: false,
    items_done: 0,
    items_total: repricedLines.reduce((s: number, l: any) => s + l.qty, 0),
    payload: {
      order_code: orderRow.code,
      order_type,
      table_label: null,
      customer_name: null,
      items: repricedLines.map((l: any) => ({
        id: l.line_id,
        name: l.item_name,
        variant: l.variant_name,
        modifiers: l.modifiers.map((m: any) => m.name),
        qty: l.qty,
      })),
    },
  });
  if (kErr) console.warn("KOT insert failed (non-fatal):", kErr.message);

  // 11. Coin redemption: deduct from wallet now (idempotent enough since we
  //     just inserted the order — only one path to this code per order id).
  if (breakdown.coins_redeemed > 0 && finalCustomerId) {
    const newBal = Math.max(0, coinsAvailable - breakdown.coins_redeemed);
    const { data: w } = await db
      .from("loyalty_wallets")
      .select("id")
      .eq("customer_id", finalCustomerId)
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();
    if (w?.id) {
      await db.from("loyalty_wallets").update({ balance: newBal, updated_at: new Date().toISOString() }).eq("id", w.id);
      await db.from("loyalty_transactions").insert({
        wallet_id: w.id, order_id: orderRow.id, type: "redeem", points: breakdown.coins_redeemed,
      });
    }
  }

  return json({
    ok: true,
    order: {
      ...orderRow,
      // Echo the breakdown so the client can reconcile / display without trusting its own math.
      breakdown,
    },
  });
});
