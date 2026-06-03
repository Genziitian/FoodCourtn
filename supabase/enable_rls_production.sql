-- ════════════════════════════════════════════════════════════════════
-- Production hardening: flip RLS back on for every tenant table.
--
-- Pre-requisites:
--   • You've completed setup.sql (which creates the policies + helper functions)
--   • You've signed in at least one platform_admin and one org_admin so that
--     auth-gated reads still work in the browser after flipping RLS on.
--
-- Run this AFTER you're confident the UI works end-to-end with sign-in.
-- It does NOT drop the existing anon GRANTs — RLS sits on top of grants. Once
-- RLS is enabled, the GRANT permits the query to be considered, then a policy
-- decides if a row is visible. Tables without a matching policy for the
-- requesting role will return zero rows.
--
-- To roll back: replace `enable row level security` with `disable row level security`.
-- ════════════════════════════════════════════════════════════════════

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
alter table pos_sessions           enable row level security;

-- ════════════════════════════════════════════════════════════════════
-- Verify which tables now have RLS on. All should say `t`.
-- ════════════════════════════════════════════════════════════════════
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by rowsecurity desc, tablename;

-- ════════════════════════════════════════════════════════════════════
-- Smoke test idea (run after enabling, signed in as a Spice Garden owner):
--
--   1. Open the admin tab signed in as Spice Garden owner.
--   2. DevTools console:
--        (await window.__FOODCOURT_SUPABASE__.from('orders')
--          .select('restaurant_id').limit(100)).data
--   3. Should only contain Spice Garden's restaurant_ids.
--      Spice Route restaurant_ids should NOT appear.
--
--   4. Repeat signed in as Spice Route owner — should see only Spice Route's.
--
--   5. As anon (signed out, but with the anon key):
--        curl "https://<project>.supabase.co/rest/v1/orders?limit=5" \
--          -H "apikey: <anon_key>"
--      → should return [] (empty). RLS is enforcing the gate.
-- ════════════════════════════════════════════════════════════════════
