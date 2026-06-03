// ════════════════════════════════════════════════════════════════════
// Edge Function: verify-otp
//
// Verifies a 2factor.in OTP using VERIFY3 (phone + code, no session_id).
// 2factor's VERIFY3 verifies against the most recent OTP sent to that phone.
//
// Inputs (POST JSON):
//   { "phone": "9876543210", "code": "123456" }
//
// Env (Supabase Edge Function secrets):
//   TWOFACTOR_API_KEY — required
//
// Deploy:
//   supabase functions deploy verify-otp --no-verify-jwt
// ════════════════════════════════════════════════════════════════════

// @ts-ignore — Deno-only import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: { env: { get(name: string): string | undefined } };

const TWOFACTOR_API_KEY = Deno.env.get("TWOFACTOR_API_KEY") ?? "";

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

function normalizeForVerify3(input: string): string | null {
  // VERIFY3 wants "91XXXXXXXXXX" — country code + 10 digits, no plus.
  const digits = String(input).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return "91" + digits.slice(-10);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

  if (!TWOFACTOR_API_KEY) {
    return json({ ok: false, error: "Server misconfigured: TWOFACTOR_API_KEY is not set." }, 500);
  }

  let phone: string | undefined;
  let code: string | undefined;
  try {
    const body = await req.json();
    phone = body?.phone;
    code = body?.code ? String(body.code) : undefined;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (!phone || !code) return json({ ok: false, error: "phone and code are required" }, 400);

  const target = normalizeForVerify3(phone);
  if (!target) return json({ ok: false, error: "Phone must include at least 10 digits" }, 400);

  // Trim/clean code — keep only digits
  const otp = code.replace(/\D/g, "");
  if (otp.length < 4) return json({ ok: false, error: "OTP looks too short" }, 400);

  const url =
    `https://2factor.in/API/V1/${encodeURIComponent(TWOFACTOR_API_KEY)}` +
    `/SMS/VERIFY3/${encodeURIComponent(target)}/${encodeURIComponent(otp)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: "GET" });
  } catch (e) {
    return json({ ok: false, error: "2factor.in unreachable", details: String(e) }, 502);
  }

  let data: { Status?: string; Details?: string } = {};
  try { data = await upstream.json(); } catch { /* ignore */ }

  // 2factor's success response is { Details: "OTP Matched" }.
  // (Their `Status` field is sometimes "Error" even on success — go by Details.)
  const matched = (data.Details ?? "").toLowerCase().includes("otp matched");

  if (!matched) {
    return json({
      ok: false,
      error: data.Details ?? "Verification failed",
    });
  }

  return json({ ok: true, phone: "+" + target });
});
