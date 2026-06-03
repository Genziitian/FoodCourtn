-- ════════════════════════════════════════════════════════════════════
-- DEV MODE NUCLEAR: disable RLS on every tenant table.
--
-- Use this if dev_open.sql isn't working. RLS is OFF entirely, so the
-- anon role has full table access (limited only by Postgres GRANTs,
-- which Supabase grants to anon by default for the public schema).
--
-- ⚠️  This is fine for dev/demo and impossible to mis-deploy because
--    the apps will still work after you flip RLS back on AND re-paste
--    setup.sql + sign-in is enabled.
--
-- Paste into Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

alter table organizations          disable row level security;
alter table restaurants            disable row level security;
alter table restaurant_staff       disable row level security;
alter table platform_admins        disable row level security;
alter table categories             disable row level security;
alter table menu_items             disable row level security;
alter table menu_variants          disable row level security;
alter table menu_modifiers         disable row level security;
alter table dining_tables          disable row level security;
alter table dining_areas           disable row level security;
alter table coupons                disable row level security;
alter table customers              disable row level security;
alter table customer_addresses     disable row level security;
alter table customer_preferences   disable row level security;
alter table customer_feedback      disable row level security;
alter table customer_push_tokens   disable row level security;
alter table orders                 disable row level security;
alter table order_items            disable row level security;
alter table order_status_events    disable row level security;
alter table kot_tickets            disable row level security;
alter table kot_ticket_items       disable row level security;
alter table coupons                disable row level security;
alter table loyalty_wallets        disable row level security;
alter table loyalty_transactions   disable row level security;
alter table payments               disable row level security;
alter table payment_gateways       disable row level security;
alter table reservations           disable row level security;
alter table audit_log              disable row level security;
alter table pos_sessions           disable row level security;

-- Quick verify:
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- ════════════════════════════════════════════════════════════════════
-- To re-enable later (production): replace `disable` with `enable` above.
-- ════════════════════════════════════════════════════════════════════
