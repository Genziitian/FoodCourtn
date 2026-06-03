// Razorpay Checkout integration. Each branch has its own Razorpay key, fetched
// from the DB via get_branch_payment_key RPC. The key_id is public; the secret
// stays server-side (admin Settings → Payments stores it in payment_gateways
// for use by a future Edge Function that signs payment requests).

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

let scriptLoading: Promise<boolean> | null = null;

function loadScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptLoading) return scriptLoading;
  scriptLoading = new Promise<boolean>((resolve) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { scriptLoading = null; resolve(false); };
    document.head.appendChild(s);
  });
  return scriptLoading;
}

export interface RazorpayParams {
  keyId: string;                // per-branch Razorpay Key ID
  amount: number;               // rupees (converted to paise inside)
  orderCode: string;            // FC-xxxxxx
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  restaurantName: string;
}

export interface RazorpayResult {
  ok: boolean;
  payment_id?: string;
  signature?: string;
  error?: string;
}

// Hard ceiling so the Promise can never stay pending forever (which would
// freeze the "Processing…" button on the checkout). 4 minutes is more than
// any real customer needs — Razorpay's own session timeout is similar.
const MAX_WAIT_MS = 4 * 60 * 1000;

/**
 * Opens Razorpay Checkout. Requires the branch's key_id — caller should fetch
 * it via `getBranchPaymentKey(restaurantId)` first.
 *
 * Resolves with:
 *   ok:true        — payment captured (handler fired)
 *   ok:false       — explicit failure path: script_failed, no_key, dismissed,
 *                    payment_failed, init_error, timeout
 *
 * Guarantees the Promise resolves; it cannot hang. Errors during `rzp.open()`
 * (e.g. invalid amount, malformed key) are caught and surfaced instead of
 * leaving the caller awaiting forever.
 */
export async function openRazorpay(params: RazorpayParams): Promise<RazorpayResult> {
  if (!params.keyId) return { ok: false, error: 'no_key' };

  const ready = await loadScript();
  if (!ready || !window.Razorpay) return { ok: false, error: 'script_failed' };

  return new Promise<RazorpayResult>((resolve) => {
    let settled = false;
    const safeResolve = (r: RazorpayResult) => { if (!settled) { settled = true; resolve(r); } };

    // Safety timeout — never let the checkout button hang forever.
    const timer = setTimeout(() => {
      safeResolve({ ok: false, error: 'timeout' });
    }, MAX_WAIT_MS);

    // Wrap every resolve so we also clear the timer.
    const finish = (r: RazorpayResult) => { clearTimeout(timer); safeResolve(r); };

    try {
      const rzp = new window.Razorpay({
        key: params.keyId,
        amount: Math.round(params.amount * 100),
        currency: 'INR',
        name: params.restaurantName,
        description: `Order ${params.orderCode}`,
        // No order_id — using the amount-only flow. Production should create
        // a Razorpay Order server-side and pass its id here so amounts can't
        // be tampered with from the client.
        prefill: {
          name: params.customerName,
          contact: params.customerPhone,
          email: params.customerEmail,
        },
        notes: { order_code: params.orderCode },
        theme: { color: '#b7122a' },
        handler: (response: any) => {
          finish({
            ok: true,
            payment_id: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        },
        modal: {
          ondismiss: () => finish({ ok: false, error: 'dismissed' }),
        },
      });
      rzp.on('payment.failed', (resp: any) => {
        finish({ ok: false, error: resp?.error?.description ?? 'payment_failed' });
      });
      rzp.open();
    } catch (e: any) {
      // Razorpay sometimes throws synchronously on bad params (invalid amount,
      // malformed key). Surface it so the caller stops awaiting.
      finish({ ok: false, error: `init_error: ${e?.message ?? 'unknown'}` });
    }
  });
}
