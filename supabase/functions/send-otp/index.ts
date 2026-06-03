// ════════════════════════════════════════════════════════════════════
// Edge Function: send-otp
//
// Triggers a 2factor.in AUTOGEN SMS.  Returns nothing the client needs to
// remember — verification later just takes the phone + code via VERIFY3.
//
// Inputs (POST JSON):
//   { "phone": "9876543210" }   // 10-digit Indian mobile, with or without +91
//
// Env (Supabase Edge Function secrets):
//   TWOFACTOR_API_KEY   — required (your 2factor.in API key)
//   TWOFACTOR_TEMPLATE  — optional, defaults to "OTP1"
//
// Deploy:
//   supabase secrets set TWOFACTOR_API_KEY=...
//   supabase secrets set TWOFACTOR_TEMPLATE=YourTemplateName
//   supabase functions deploy send-otp --no-verify-jwt
//
// `--no-verify-jwt` is on purpose: anonymous customers haven't signed in yet
// when they request an OTP.
// ════════════════════════════════════════════════════════════════════

// @ts-ignore — Deno-only import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

declare const Deno: { env: { get(name: string): string | undefined } };

const TWOFACTOR_API_KEY = Deno.env.get("TWOFACTOR_API_KEY") ?? "";
const TWOFACTOR_TEMPLATE = Deno.env.get("TWOFACTOR_TEMPLATE") ?? "OTP1";

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

function normalizePhone(input: string): string | null {
  // Strip everything except digits and +
  const cleaned = String(input).trim().replace(/[^\d+]/g, "");
  // Pull the last 10 digits — robust against "+91", "91", or just "9876543210"
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return `+91${last10}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  if (!TWOFACTOR_API_KEY) {
    return json({ error: "Server misconfigured: TWOFACTOR_API_KEY is not set." }, 500);
  }

  let phone: string | undefined;
  try {
    const body = await req.json();
    phone = body?.phone;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!phone) return json({ error: "phone is required" }, 400);

  const e164 = normalizePhone(phone);
  if (!e164) return json({ error: "Phone must include at least 10 digits" }, 400);

  const url =
    `https://2factor.in/API/V1/${encodeURIComponent(TWOFACTOR_API_KEY)}` +
    `/SMS/${encodeURIComponent(e164)}/AUTOGEN/${encodeURIComponent(TWOFACTOR_TEMPLATE)}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: "GET" });
  } catch (e) {
    return json({ error: "2factor.in unreachable", details: String(e) }, 502);
  }

  let data: { Status?: string; Details?: string } = {};
  try { data = await upstream.json(); } catch { /* ignore parse */ }

  if (data.Status !== "Success") {
    return json({
      ok: false,
      error: data.Details ?? "Send failed",
      upstream_status: upstream.status,
    }, 502);
  }

  // We don't need the session id (we use VERIFY3 with phone+code). Return ok.
  return json({ ok: true, phone: e164 });
});
