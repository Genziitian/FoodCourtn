# FoodCourt — going live with Supabase

Run these once, in order.

## 1. Apply the schema to your Supabase project

You picked the "paste SQL myself" path. Two files in `supabase/`:

- **`supabase/setup.sql`** — 1,500 lines. Schema + RLS + seed for orgs, branches, menus, tables, coupons, areas, customer policies. **Idempotent** — re-running it is safe (uses `WHERE NOT EXISTS` / `ON CONFLICT`).
- **`supabase/reset.sql`** — DROPs the public schema. Use only if you want a clean slate.

**Steps:**

1. Open [Supabase Dashboard](https://app.supabase.com/project/oztyaxmlwnmpzgylbyfq) → **SQL Editor** → **New query**
2. Paste the **entire** contents of `supabase/setup.sql`
3. Click **Run**. Expect this to take ~5–15 seconds. You should see a green "Success" toast.

**Verify it worked** — in the SQL Editor run:
```sql
select
  (select count(*) from organizations) as orgs,
  (select count(*) from restaurants) as branches,
  (select count(*) from menu_items) as menu_items,
  (select count(*) from dining_tables) as tables,
  (select count(*) from coupons) as coupons;
```

Expected: `orgs ≥ 2`, `branches ≥ 5`, `menu_items ≥ 40`, `tables ≥ 27`, `coupons ≥ 7`.

## 2. Restart the dev servers

The Supabase env vars are in `.env`. If the dev servers were already running before you set them, restart them so Vite picks them up:

```bash
pnpm dev:customer    # http://localhost:5173
pnpm dev:admin       # http://localhost:5174
pnpm dev:kds         # http://localhost:5175
```

## 3. End-to-end test checklist

### Branch URLs

Each branch now has its own customer-facing URL. The slugs are:

| Branch | Customer URL |
|---|---|
| The Spice Route (Whitefield) | http://localhost:5173/the-spice-route/t/sr-t1 |
| Spice Garden — MG Road | http://localhost:5173/spice-garden/t/sg-mg-t1 |
| Spice Garden — Koramangala | http://localhost:5173/spice-garden-koramangala/t/sgkor-t1 |
| Spice Garden — Indiranagar | http://localhost:5173/spice-garden-indiranagar/t/sgind-t1 |

All branches have 8 tables (suffix `-t1` … `-t8`). Replace `-t1` with any table to simulate scanning that table's QR code.

### The critical happy path

Open two browser tabs side by side.

**Tab 1 — admin** (`http://localhost:5174`)

1. Sidebar → switch to **Spice Garden — Koramangala** (or any branch)
2. Click **Orders** in the sidebar. Should show "Live · realtime" indicator and "No orders yet" message
3. Click **Dashboard**. Should show "Revenue today ₹0" and live skeleton

**Tab 2 — customer** (`http://localhost:5173/spice-garden-koramangala/t/sgkor-t1`)

1. Landing page should load with **Spice Garden — Koramangala** name and **Table 1** badge
2. Click **Start Ordering** → menu should render with categories from DB
3. Add 2-3 items to cart, customize one with portion/spice/toppings
4. Click **View Cart** → coupon (KOR150) should auto-apply since order is ≥ ₹400
5. Click **Proceed to Pay** → wait for redirect to `/order/FC-xxxxxx`
6. Status should show **Order Received**

**Back to Tab 1 — admin Orders**
- Within ~1 second, the new order should appear at the top of the table without a refresh
- Click the **Start Preparing** button
- **Tab 2** — the customer's tracking page should update to "Preparing" status without a refresh
- Click **Mark Ready** in admin → Tab 2 jumps to "Ready"
- Click **Complete** in admin → Tab 2 jumps to "Completed" and pops the rating modal

### Multi-branch isolation

1. Switch admin sidebar to **The Spice Route**
2. Orders should now be empty (different branch)
3. Switch to **All branches** in the dropdown
4. Orders should show across every branch you've placed orders in

### Things to also check

- Admin **Dashboard** → revenue/orders/AOV update live as orders come in
- Customer **Profile → Order history** → shows their own orders from DB
- Branch switch in admin sidebar instantly reloads metrics + order list
- Page refresh in either app preserves state (customer cart in localStorage; admin scope in localStorage)

## 4. What's wired (everything)

Every admin and super-admin page now reads/writes Supabase directly. The yellow Mocks banner is gone.

**Admin (per branch / "All branches"):**
- **Dashboard** — live revenue, orders, AOV, hourly sales (`getDashboardMetrics`)
- **Orders** — live list + realtime updates + status transitions
- **Menu items** — full CRUD against `menu_items` + `categories`; in-stock toggle, add/edit/delete
- **Offers & coupons** — create/toggle/delete coupons against `coupons` table
- **Customers** — list from `customers` with order history drawer
- **Tables & QR** — list/create/delete `dining_tables`; per-table active order + today revenue
- **Reservations** — list/create/advance status against `reservations`
- **Loyalty** — members + transactions from `loyalty_wallets` + `loyalty_transactions`
- **Payments** — list from `payments` table; refund mutates the row
- **Staff** — list from `restaurant_staff` (invite blocked until Supabase Auth is wired)
- **Reports** — live aggregates by range (today/week/month/quarter): hourly bars, top items, payment methods, 7-day trend
- **Notifications** — derived from `orders` (incoming/transitions) + `payments` (failed/refunded) + `audit_log`
- **Settings** — read/write `restaurants.settings` JSONB + payment_gateways CRUD

**Super Admin:**
- **Dashboard** — platform-wide aggregates (orgs, branches, GMV today, commission, failed payments)
- **Restaurants** — list orgs + branches; create org; create branch under org
- **Payments** — provider-level aggregates from real `payment_gateways` + `payments` tables
- **Admins** — list `platform_admins` (invites coming with Supabase Auth wiring)
- **Health** — actual probe of Postgres + Realtime + latency
- **Support** — placeholder until a `support_tickets` table is added

**Customer:**
- **Addresses** — full CRUD against `customer_addresses` (was localStorage)

## 5. What's still mock / TODO

- **Supabase Auth** — staff sign-in, customer phone OTP (currently any 6-digit code accepted). Staff Invite + Super Admin Invite buttons are intentionally disabled until then.
- **Razorpay flow** — `placeOrderRow` hardcodes `payment_status: 'success'`. Real flow needs a Razorpay Checkout + a webhook handler.
- **Edge Function for `place-order`** — server-side re-pricing for security hardening.
- **Push notifications** — `customer_push_tokens` table exists; FCM not wired.
- **KDS integration** — KOT tickets are inserted; KDS app subscribes but lacks status mutations UI.

## 6. Common gotchas

- **"Could not load orders"** — schema isn't applied. Re-run `supabase/setup.sql`.
- **Empty menu / 404 on QR URL** — the seed didn't run completely. Check the SQL Editor output for errors.
- **CORS errors in browser console** — `VITE_SUPABASE_URL` doesn't match the project; check `.env`.
- **"Realtime not working"** — Supabase Realtime is enabled by default for new projects but needs to be enabled per-table. Project → Database → Publications → ensure `orders` and `order_status_events` are in the `supabase_realtime` publication.

## 7. To reset and start over

```sql
-- in SQL Editor:
-- 1) paste contents of supabase/reset.sql, run
-- 2) paste contents of supabase/setup.sql, run
```
