// ════════════════════════════════════════════════════════════════════
// Edge Function: razorpay-webhook
//
// Receives signed webhook events from Razorpay and updates order/payment
// rows. This is the ONLY path that flips an order's `payment_status` to
// 'success' for online payments — the place-order function leaves new
// orders in 'pending' so a tampered client-side success message can't
// fake settlement.
//
// Razorpay events we care about (configure these in their dashboard):
//   • payment.captured  → mark order paid, insert payment row
//   • payment.failed    → mark order failed (counter-pay still available)
//   • payment.authorized → log only; capture is what matters
//
// Security:
//   • Razorpay signs every webhook with the secret you set in their
//     dashboard. We HMAC-SHA256 the RAW body and compare against the
//     X-Razorpay-Signature header. Reject if mismatch — even a 1-byte
//     change in the body should fail.
//   • Reading the body twice is intentional (raw text for the signature,
//     then JSON.parse for the event).
//
// Inputs: Razorpay POST payload — passes through, never modify the body.
// Output: 200 OK to ack receipt; 400/401 on bad input/signature.
//
// Env:
//   SUPABASE_URL                  — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY     — required (set via `supabase secrets set`)
//   RAZORPAY_WEBHOOK_SECRET       — required, paste from Razorpay dashboard
//
// Deploy:
//   supabase secrets set RAZORPAY_WEBHOOK_SECRET=whsec_...
//   supabase functions deploy razorpay-webhook --no-verify-jwt
//
// Then in Razorpay Dashboard → Webhooks → Add:
//   URL    : https://<project>.functions.supabase.co/razorpay-webhook
//   Secret : same value as RAZORPAY_WEBHOOK_SECRET
//   Events : payment.captured, payment.failed, payment.authorized
// ════════════════════════════════════════════════════════════════════

// @ts-ignore Deno-only
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore esm.sh
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RAZORPAY_WEBHOOK_SECRET   = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";

const CORS = {
  // Razorpay doesn't preflight, but a permissive ACAO is harmless and helps testing.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id",
};

function plain(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// HMAC-SHA256(secret, raw_body) → hex. Web Crypto in Deno.
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Constant-time compare so length / prefix attacks don't leak timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")     return plain({ error: "Use POST" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return plain({ error: "Server misconfigured" }, 500);
  }
  if (!RAZORPAY_WEBHOOK_SECRET) {
    return plain({ error: "RAZORPAY_WEBHOOK_SECRET not set" }, 500);
  }

  // 1. Verify the signature against the RAW body (no parse yet).
  const raw = await req.text();
  const sigHeader = req.headers.get("x-razorpay-signature") ?? "";
  if (!sigHeader) return plain({ error: "Missing x-razorpay-signature" }, 401);

  const expected = await hmacSha256Hex(RAZORPAY_WEBHOOK_SECRET, raw);
  if (!safeEqual(expected, sigHeader)) {
    return plain({ error: "Signature mismatch" }, 401);
  }

  // 2. Parse the event AFTER verification.
  let event: any;
  try { event = JSON.parse(raw); } catch { return plain({ error: "Invalid JSON" }, 400); }

  const eventType = event?.event as string | undefined;
  const payment   = event?.payload?.payment?.entity;
  const eventId   = req.headers.get("x-razorpay-event-id") ?? null;

  if (!eventType || !payment) {
    return plain({ error: "Unexpected payload shape" }, 400);
  }

  // 3. Pull the order this payment refers to. We set `notes.order_code` when
  //    opening Razorpay Checkout; receipt is the order code too as a fallback.
  const orderCode = payment.notes?.order_code ?? payment.receipt ?? null;
  if (!orderCode) {
    // Nothing we can correlate — ack so Razorpay stops retrying, but log.
    console.warn("razorpay-webhook: no order_code in notes/receipt; event ignored");
    return plain({ ok: true, ignored: "no order_code in payload" });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, restaurant_id, payment_status, code, total")
    .eq("code", orderCode)
    .maybeSingle();
  if (orderErr) return plain({ error: orderErr.message }, 500);
  if (!order) {
    // Order vanished or never existed — ack so we don't loop.
    return plain({ ok: true, ignored: `order ${orderCode} not found` });
  }

  // 4. Map Razorpay event → our payment_status. Already-success orders are
  //    a no-op (idempotency: Razorpay may retry).
  let nextStatus: 'success' | 'failed' | null = null;
  if (eventType === "payment.captured")  nextStatus = "success";
  if (eventType === "payment.failed")    nextStatus = "failed";

  if (nextStatus && order.payment_status !== nextStatus) {
    const { error: updErr } = await db
      .from("orders")
      .update({ payment_status: nextStatus })
      .eq("id", order.id);
    if (updErr) return plain({ error: updErr.message }, 500);
  }

  // 5. Always write a payments row so we have a complete audit trail.
  //    Use the Razorpay payment id as a natural key for idempotency.
  if (payment.id) {
    const { error: payErr } = await db
      .from("payments")
      .upsert({
        restaurant_id: order.restaurant_id,
        order_id:      order.id,
        provider:      "razorpay",
        gateway_payment_id: payment.id,
        gateway_order_id:   payment.order_id ?? null,
        amount:        Number(payment.amount) / 100,   // Razorpay returns paise
        currency:      payment.currency ?? "INR",
        status:        nextStatus ?? (eventType === "payment.authorized" ? "authorized" : "pending"),
        method:        payment.method ?? null,
        raw_payload:   payment,
      }, { onConflict: "gateway_payment_id" });
    if (payErr) {
      // The order row update already happened — log and ack.
      console.warn("payments upsert failed:", payErr.message);
    }
  }

  return plain({ ok: true, event: eventType, event_id: eventId, order_code: orderCode });
});
