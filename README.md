# FoodCourt

QR-based multi-tenant restaurant SaaS — customer ordering, kitchen display, admin dashboard.

## Stack
- **Monorepo:** pnpm workspaces
- **Frontends:** Vite + React + TypeScript + Tailwind (3 apps)
- **Backend:** Supabase (Postgres + RLS + Realtime + Auth + Storage)
- **Shared:** `packages/shared` for types, pricing engine, design tokens, supabase client

## Apps
| App | Port | Path |
|---|---|---|
| Customer (QR ordering) | 5173 | `apps/customer` |
| Admin dashboard | 5174 | `apps/admin` |
| Kitchen Display (KDS) | 5175 | `apps/kds` |

## Quickstart (no backend needed)

The apps run end-to-end against in-memory mocks if `VITE_SUPABASE_URL` is unset.

```bash
pnpm install
pnpm dev:customer   # http://localhost:5173 → redirects to The Spice Route, Table 7
pnpm dev:admin      # http://localhost:5174 → Spice Garden admin
pnpm dev:kds        # http://localhost:5175 → live KOT board
```

Open all three in separate terminals to see the multi-surface experience.

## Hooking up Supabase

1. Create a Supabase project, copy URL + anon key into `.env`:
   ```
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```
2. Run the migrations under `supabase/migrations/` in order. With the Supabase CLI:
   ```bash
   supabase db push
   ```
3. The data layer (`apps/customer/src/lib/data.ts`) will automatically switch from mocks to live queries.

## Routing (customer)

- `/:slug/t/:qrToken`           → landing
- `/:slug/t/:qrToken/menu`      → menu
- `/:slug/t/:qrToken/cart`      → cart
- `/:slug/t/:qrToken/order/:code` → order tracking
- `/:slug` (no `/t/...`)        → takeaway flow

`/` redirects to `/the-spice-route/t/sr-t7` for demos.

## Repository

```
.
├── apps/
│   ├── customer/   # Next-gen QR ordering PWA
│   ├── admin/      # Restaurant + super-admin console
│   └── kds/        # Kitchen tablet display
├── packages/
│   └── shared/     # types, pricing engine, design tokens, supabase client, mocks
└── supabase/
    ├── migrations/ # 0001 schema · 0002 RLS · 0003 seed
    └── config.toml
```

## What's wired today

- ✅ Customer: landing, menu (filter, categories, recommended, special-offer banner), item modal (variants + add-ons), cart (coupon engine, coins, GST, totals), live status tracking
- ✅ Admin: layout (sidebar + tenant switcher + topbar), dashboard with all metric cards from the mockup
- ✅ KDS: dark-themed KOT board with stations, RUSH badge, live elapsed timers, per-item check, Start/Mark Ready/Complete pipeline
- ✅ Supabase: complete schema (tenants, menu, orders, KOT, loyalty, audit), RLS for multi-tenant isolation, seed data matching the mockups

## What's deferred

- Razorpay (cart says "payment at counter")
- Real OTP login (Supabase Auth phone OTP is configured but UI not wired)
- Edge Function `place-order` (right now `placeOrder()` returns a mock)
- Electron print bridge (browser ESC/POS for MVP)
- Analytics charts (Recharts — Phase 3)
