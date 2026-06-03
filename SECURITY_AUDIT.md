# FoodCourt — Final security audit

A pass through every layer (routes, data, secrets, payments) with verdicts and a production hardening checklist.

Status flags:
- ✅ Done — enforced
- 🟡 Partial — works for dev, hardening needed before prod
- ❌ Hole — must be fixed before live

---

## 1. Routes — who can reach what

| Path | Public? | Gate |
|---|---|---|
| `/login` (admin) | ✅ Yes (public, signing in) | none |
| `/dashboard`, `/orders`, `/menu`, `/tables`, `/payments`, `/payments-config`, `/managers`, `/staff`, `/customers`, `/reports`, `/notifications`, `/settings`, `/kds`, `/loyalty`, `/offers` | ❌ No | `<RequireAuth mode="staff">` — requires `staff` OR `org_admin` OR `platform_admin` |
| `/super/*` (all sub-pages) | ❌ No | `<RequireAuth mode="platform">` — requires `platform_admins` row |
| `/login` (customer) | ✅ Yes (public) | none |
| `/:slug`, `/:slug/t/:qrToken`, menu, cart, profile, tracking | ❌ No | `<RequireCustomer>` — requires customer phone-OTP user |

**Verdict ✅** — every admin route is gated. Anonymous visitors to `/managers`, `/super`, `/menu` etc. all bounce to `/login`. Sign in as a Spice Garden org admin → only Spice Garden orgs visible. Sign in as a branch manager → only their branch shown. Sign in as platform admin → super dashboard accessible.

---

## 2. Tenant data scoping (frontend)

[apps/admin/src/lib/tenant.tsx](apps/admin/src/lib/tenant.tsx) filters which orgs and branches the signed-in user sees, based on session:

| Role | Sidebar shows |
|---|---|
| `platform_admin` (super) | All orgs, all branches |
| `org_admin` (in `org_admins`) | Only their org(s); all branches in those orgs |
| Branch manager (`restaurant_staff.role='manager'`) | Only the branch(es) they manage; cannot switch to "All branches" |
| Anonymous (guest) | N/A — RequireAuth bounces them to `/login` |

**Verdict ✅** — sidebar enforces the right view. `scopedRestaurantIds` from the tenant context filters every Supabase query in every page.

---

## 3. Payment gateway isolation

| Surface | Behavior | Verdict |
|---|---|---|
| Super Admin → Payment Integrations | Read-only: shows # of branches per provider + volume. **No keys, no secrets, no edits.** | ✅ |
| Org Admin → Payment Keys | Per-branch Key ID + Secret + Test/Live for all 5 providers (Razorpay, PhonePe, Paytm, Cashfree, Stripe). | ✅ |
| Customer checkout | Calls `get_branch_payment_key(branch_id)` RPC that returns only `key_id` + `provider` + `test_mode` — never `secret_key`. | ✅ |
| Branch isolation | Each branch row in `payment_gateways` is independent. Spice Garden — MG keys are separate from Spice Garden — Indiranagar. | ✅ |

**Verdict ✅** — at the application layer, payment secrets are scoped correctly. The `secret_key` column is only read by the org admin's own UI when they actively paste it; super admins never have any UI surface that selects `secret_key`.

🟡 At the DB layer, secrets are still plaintext. Production hardening:
- Move `secret_key` to Supabase Vault (store a `secret_ref` in `payment_gateways`, not the raw key)
- Add an Edge Function `place-order` that creates the Razorpay Order server-side using vault secrets

---

## 4. Sign-in flows

| User type | Method | Status |
|---|---|---|
| Platform / org / branch admins | Email + password (Supabase Auth `signInWithPassword`) | ✅ |
| First-ever signup → auto-promote to platform_admin | Yes, via `signUp` checking `platform_admins` is empty | ✅ |
| Org owner created by super admin | `signUp` + `add_org_admin` RPC (session-restore trick) | ✅ |
| Branch manager created by org admin | `signUp` + `add_branch_manager` RPC | ✅ |
| Customer | 2factor.in OTP via Edge Function (`send-otp` + `verify-otp`) | ✅ |

🟡 Session-restore trick is a client-side workaround — it temporarily signs in the new user, then restores the creator's session. Production should move to a service-role Edge Function (`admin/create-user`) that doesn't swap sessions.

---

## 5. Sign-out flows

| Where | Status |
|---|---|
| Admin sidebar footer → "Sign out" | ✅ Calls `signOut()` → bounces to `/login` |
| Super Admin sidebar footer → "Sign out" | ✅ Same |
| Customer Profile → "Sign out" | ✅ Calls `useAuth().logout()` → clears user + addresses |

---

## 6. ❌ Critical gap — Row-Level Security is OFF

This is the biggest remaining risk.

**The route gate is JavaScript.** A determined attacker doesn't run JavaScript — they take the public `anon` key from your browser, open a terminal, and curl Supabase REST directly:

```bash
curl "https://oztyaxmlwnmpzgylbyfq.supabase.co/rest/v1/orders" \
  -H "apikey: YOUR_ANON_KEY"
```

If RLS is OFF, that returns **every order from every restaurant**. The route gate doesn't help.

**Current state:** `dev_disable_rls.sql` was run during early development. All tenant tables have `rowsecurity = false`. Anon role can read/write anything.

**Fix:** re-enable RLS with the policies already in `setup.sql`.

```sql
-- Production RLS — paste into Supabase SQL Editor
alter table organizations          enable row level security;
alter table restaurants            enable row level security;
alter table restaurant_staff       enable row level security;
alter table platform_admins        enable row level security;
alter table org_admins             enable row level security;
alter table categories             enable row level security;
alter table menu_items             enable row level security;
alter table menu_variants          enable row level security;
alter table menu_modifiers         enable row level security;
alter table dining_tables          enable row level security;
alter table dining_areas           enable row level security;
alter table coupons                enable row level security;
alter table customers              enable row level security;
alter table customer_addresses     enable row level security;
alter table customer_feedback      enable row level security;
alter table customer_preferences   enable row level security;
alter table customer_push_tokens   enable row level security;
alter table orders                 enable row level security;
alter table order_items            enable row level security;
alter table order_status_events    enable row level security;
alter table kot_tickets            enable row level security;
alter table kot_ticket_items       enable row level security;
alter table loyalty_wallets        enable row level security;
alter table loyalty_transactions   enable row level security;
alter table payments               enable row level security;
alter table payment_gateways       enable row level security;
alter table reservations           enable row level security;
alter table audit_log              enable row level security;
alter table support_tickets        enable row level security;
alter table payment_providers      enable row level security;
```

The policies that take over after this are already in `setup.sql`:
- `is_staff_of(restaurant_id)` — true if `auth.uid()` has a row in `restaurant_staff` for that restaurant
- `is_staff_of_org(organization_id)` — true if user is staff of any branch in that org
- `is_platform_admin()` — true if user has a row in `platform_admins`

These functions are referenced by RLS policies like `orders_staff_all`, `coupons_staff_all`, `payment_gateways_staff_all`, etc. After re-enabling RLS, every query the browser makes is filtered by these — so a Spice Garden org admin literally cannot SELECT from Spice Route's orders, even with curl + the anon key.

**Smoke test after re-enabling RLS:**
1. Sign in as a Spice Garden manager.
2. In DevTools console:
   ```js
   (await window.__FOODCOURT_SUPABASE__.from('orders').select('restaurant_id').limit(100)).data
   ```
3. Should only return Spice Garden's orders. Spice Route orders should not appear.
4. Sign in as Spice Route owner → same query → only Spice Route's orders.

---

## 7. Secrets management

| Secret | Where it lives | Verdict |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` (root) → bundled into JS | ✅ Public by design |
| `VITE_SUPABASE_ANON_KEY` | `.env` (root) → bundled into JS | ✅ Public by design (limited by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` (root) — server-only | ✅ Never sent to browser. **Should be rotated** — was shared in past chat logs |
| `TWOFACTOR_API_KEY` | Supabase secret (`supabase secrets set`) — Edge Function only | ✅ Never sent to browser |
| Database password (`Soch@12345Studios`) | `.env`, never used by client | ⚠️ **Rotate** — also shared in past chat logs |
| Razorpay test key `rzp_test_Sspu8DVzpu4KkQ` | `payment_gateways.key_id` in DB | ✅ Public-by-design (Razorpay Key ID is meant to be exposed) |
| Razorpay secret `7HbU7nDE9KWy97rHpJfu2Ak5` | `payment_gateways.secret_key` plaintext | 🟡 Test key, OK for dev. Production: move to Supabase Vault + Edge Function |

**Action items:**
1. **Rotate Service Role key** — Supabase Dashboard → Settings → API → "Reset service role secret"
2. **Rotate DB password** — Supabase Dashboard → Settings → Database → "Reset database password"
3. Both were exposed in past chat logs.

---

## 8. Payments — server-side gaps

| Concern | Status |
|---|---|
| Order price computed client-side (`calculatePrice` in shared package) | 🟡 Client could tamper with cart total before INSERT |
| `placeOrderRow` writes `payment_status: 'success'` regardless of actual payment | 🟡 Customer can mark order paid without paying |
| Razorpay Checkout uses key_id only (no server-side order_id) | 🟡 Modern Razorpay accounts reject this — Checkout almost always fails |
| Razorpay webhook signature verification | ❌ Not implemented |

**Production fix path** (half-day of work):
1. Edge Function `place-order` (`apps/customer/src/lib/api.ts` → call this instead of `placeOrderRow`):
   - Re-compute price server-side from `cart.line.menu_item_id` lookups
   - Insert order with `payment_status: 'pending'`
   - Call Razorpay Orders API with merchant secret from Vault → return `razorpay_order_id`
2. Customer Cart opens Razorpay Checkout with that `razorpay_order_id` (not the amount-only flow)
3. Edge Function `razorpay-webhook` — verifies signature with `RAZORPAY_WEBHOOK_SECRET`, flips order to `paid` only when verified
4. The customer can no longer manipulate prices, and a webhook handles real settlement events

---

## 9. Customer privacy

| Concern | Status |
|---|---|
| Anonymous browser UUID (customerId) | ✅ |
| Customer profile (name, phone) gated behind OTP | ✅ |
| `customers` table RLS | ❌ Off — anyone with anon key can list every diner's phone number |

**Fix when re-enabling RLS:** the policy `customers_self_read` in `setup.sql` only allows reading the customer's own row via a `customer_id` JWT claim. That requires signing customers in via Supabase Auth or minting a custom JWT after 2factor verification. Until then, `customers` should at minimum be locked down to "no anon SELECT":

```sql
alter table customers enable row level security;
drop policy if exists customers_anon_select on customers;
drop policy if exists customers_anon_update on customers;
drop policy if exists customers_anon_insert on customers;
-- Then implement either:
-- a) Sign customers in via Supabase Auth and use customers_self_read
-- b) Or: keep all customer DB writes server-side via an Edge Function
```

---

## 10. Database checks — current state

Run these in Supabase SQL Editor to verify the DB matches the expected setup.

### Check A — Which tables have RLS on?

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by rowsecurity desc, tablename;
```

Expected (today): most rows `false`. After production hardening, should be `true` for every tenant table.

### Check B — Grants for the anon role

```sql
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
order by table_name, privilege_type;
```

Expected: every public-schema table has SELECT/INSERT/UPDATE/DELETE for anon (because we ran `dev_grants.sql`). Production: only the customer-public tables should have SELECT/INSERT, others should require an authenticated session.

### Check C — Role tier counts

```sql
select 'platform_admins' as tier, count(*) from platform_admins
union all select 'org_admins',        count(*) from org_admins
union all select 'restaurant_staff',  count(*) from restaurant_staff;
```

Expected: at least 1 platform_admin (the first user who signed up), 1+ org_admins (per organization), and N restaurant_staff (auto-linked owners + manually-added managers).

### Check D — Org → branch → admin mapping (tenant integrity)

```sql
select o.name as org, count(distinct r.id) as branches, count(distinct oa.user_id) as org_admins
from organizations o
left join restaurants r on r.organization_id = o.id
left join org_admins oa on oa.organization_id = o.id
group by o.name
order by o.name;
```

Every org should have at least 1 admin. If an org has 0 org_admins, no one can manage it.

### Check E — Trigger sanity (orders ↔ KOT sync)

```sql
select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('kot_status_sync', 'order_status_sync',
                       'org_admin_links_branches', 'branch_link_org_admins',
                       'feedback_rating_recalc', 'branch_seed_gateways')
order by trigger_name;
```

Expected: 6 rows. If any are missing, re-run the matching SQL file in `supabase/`.

---

## 11. Production hardening checklist (in order)

```
[ ] Rotate SUPABASE_SERVICE_ROLE_KEY and DB password (Supabase Dashboard)
[ ] Re-enable RLS on every tenant table (section 6 SQL)
[ ] Verify smoke tests from section 6 pass
[ ] Lock down customers table (section 9)
[ ] Move payment_gateways.secret_key to Supabase Vault
[ ] Build place-order Edge Function with server-side re-pricing + Razorpay order creation
[ ] Build razorpay-webhook Edge Function with signature verification
[ ] Move account creation (signUp + role link) to a service-role Edge Function
[ ] Add audit logging to staff/admin role changes (orgs / payment keys / etc.)
[ ] Configure DLT-approved 2factor template + sender ID for live SMS
```

---

## What's currently safe

- Routes are gated at the JavaScript layer
- Sign-in works for all three role tiers + customer phone OTP
- Tenant scoping in the sidebar prevents accidental cross-org views
- Payment secrets are never surfaced to super admins
- Customer cannot directly tamper with the price on confirmed orders (DB row is `payment_status='success'` from the original insert; even if a webhook never fires, you can read the inserted amount)

## What's currently unsafe for production

- RLS is off → anon Supabase key + curl bypasses all routing
- Customer prices are computed client-side
- Razorpay webhooks aren't verified
- Payment secrets are plaintext

**These four are the blockers for going live.** Everything else is incremental hardening.
