// ════════════════════════════════════════════════════════════════════
// Edge Function: admin-create-user
//
// Service-role account creation for admin users. Replaces the dev-only
// `saveAndRestoreSession` trick in the browser that swaps Supabase sessions
// while creating new auth users — that trick breaks under tight RLS and
// leaves a window where another admin's session can be observed.
//
// What it does, end to end:
//   1. Authenticates the CALLER from the Authorization: Bearer <jwt> header.
//   2. Authorizes the caller against the role they're trying to create.
//   3. Creates the auth user via the service-role admin API (no email confirm).
//   4. Calls the matching role-linking RPC (add_org_admin / add_branch_manager).
//   5. Returns the new user_id.
//
// Inputs (POST JSON):
//   {
//     "role": "org_admin" | "branch_manager",
//     "email": "...", "password": "...", "display_name"?: "...",
//     "context": { "organization_id"?: uuid, "restaurant_id"?: uuid }
//   }
//
// Authorization rules:
//   • role="org_admin"      → caller must be a platform_admin.
//   • role="branch_manager" → caller must be a platform_admin OR an org_admin
//                              of the restaurant's organization OR an owner
//                              in that branch's restaurant_staff.
//
// Notes:
//   • Deploy WITHOUT --no-verify-jwt. We want Supabase to require a session.
//   • Idempotent on email collision — returns 409 with "already exists".
//
// Env:
//   SUPABASE_URL                — auto
//   SUPABASE_SERVICE_ROLE_KEY   — required (set via `supabase secrets set`)
//   SUPABASE_ANON_KEY           — auto (used to validate caller JWT)
//
// Deploy:
//   supabase functions deploy admin-create-user
// ════════════════════════════════════════════════════════════════════

// @ts-ignore Deno-only
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore npm specifier (Deno native, no esm.sh fetch — avoids 10s bundling timeouts)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")     return json({ ok: false, error: "Use POST" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return json({ ok: false, error: "Server misconfigured" }, 500);
  }

  // 1. Identify the caller from the JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ ok: false, error: "Missing bearer token" }, 401);

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userResp, error: authErr } = await anon.auth.getUser(jwt);
  if (authErr || !userResp?.user) {
    return json({ ok: false, error: "Invalid session" }, 401);
  }
  const callerId = userResp.user.id;

  // 2. Parse + validate body.
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const role         = body?.role as 'org_admin' | 'branch_manager' | undefined;
  const email        = String(body?.email ?? '').trim();
  const password     = String(body?.password ?? '');
  const displayName  = body?.display_name?.trim?.() ?? '';
  const context      = body?.context ?? {};

  if (!role || (role !== 'org_admin' && role !== 'branch_manager')) {
    return json({ ok: false, error: "role must be 'org_admin' or 'branch_manager'" }, 400);
  }
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "Invalid email" }, 400);
  if (password.length < 6)   return json({ ok: false, error: "Password must be ≥ 6 characters" }, 400);

  if (role === 'org_admin' && !context.organization_id) {
    return json({ ok: false, error: "organization_id required for org_admin" }, 400);
  }
  if (role === 'branch_manager' && !context.restaurant_id) {
    return json({ ok: false, error: "restaurant_id required for branch_manager" }, 400);
  }

  // 3. Service-role client (used for admin user creation + RLS-bypassing reads).
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Authorize: can THIS caller create THIS role?
  const { data: platformRow } = await db
    .from("platform_admins").select("role").eq("user_id", callerId).maybeSingle();
  const isPlatformAdmin = !!platformRow;

  if (role === 'org_admin' && !isPlatformAdmin) {
    return json({ ok: false, error: "Only platform admins can add org admins" }, 403);
  }

  if (role === 'branch_manager') {
    let allowed = isPlatformAdmin;
    if (!allowed) {
      // Org admin of the branch's organization?
      const { data: branch } = await db
        .from("restaurants").select("organization_id").eq("id", context.restaurant_id).maybeSingle();
      if (branch?.organization_id) {
        const { data: orgAdmin } = await db
          .from("org_admins")
          .select("user_id")
          .eq("user_id", callerId)
          .eq("organization_id", branch.organization_id)
          .maybeSingle();
        allowed = !!orgAdmin;
      }
      if (!allowed) {
        // Owner staff in this branch?
        const { data: staff } = await db
          .from("restaurant_staff")
          .select("role")
          .eq("user_id", callerId)
          .eq("restaurant_id", context.restaurant_id)
          .maybeSingle();
        if (staff && staff.role === 'owner') allowed = true;
      }
    }
    if (!allowed) return json({ ok: false, error: "Not authorized for this branch" }, 403);
  }

  // 5. Create the auth user (auto-confirmed → no email link required).
  const { data: created, error: createErr } = await (db as any).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName || email.split("@")[0] },
  });
  if (createErr) {
    const msg = createErr.message ?? "";
    if (/already registered|already exists|user already|duplicate/i.test(msg)) {
      return json({ ok: false, error: "A user with this email already exists." }, 409);
    }
    return json({ ok: false, error: `Could not create user: ${msg}` }, 500);
  }
  const newUserId = created?.user?.id;
  if (!newUserId) return json({ ok: false, error: "Auth user creation returned no id" }, 500);

  // 6. Link them via the existing security-definer RPCs.
  if (role === 'org_admin') {
    const { error } = await db.rpc("add_org_admin", {
      org:              context.organization_id,
      uid:              newUserId,
      email_arg:        email,
      display_name_arg: displayName || email.split("@")[0],
    });
    if (error) {
      // Best-effort rollback: delete the auth user so the operator can retry.
      await (db as any).auth.admin.deleteUser(newUserId).catch(() => { /* ignore */ });
      return json({ ok: false, error: `add_org_admin failed: ${error.message}` }, 500);
    }
  } else {
    const { error } = await db.rpc("add_branch_manager", {
      rid:              context.restaurant_id,
      uid:              newUserId,
      display_name_arg: displayName || email.split("@")[0],
    });
    if (error) {
      await (db as any).auth.admin.deleteUser(newUserId).catch(() => { /* ignore */ });
      return json({ ok: false, error: `add_branch_manager failed: ${error.message}` }, 500);
    }
  }

  return json({ ok: true, user_id: newUserId });
});
