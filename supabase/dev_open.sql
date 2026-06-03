-- ════════════════════════════════════════════════════════════════════
-- DEV MODE: open anon-role access to every table the admin/KDS apps use.
--
-- Why: we removed the sign-in gate from the apps, so every Supabase query
-- runs as the `anon` role. The existing policies only allowed authenticated
-- staff and platform admins to read/write tenant tables — this script adds
-- permissive companion policies so the apps work without auth.
--
-- ⚠️  NOT FOR PRODUCTION. Drop these policies (or DROP POLICY each) when
-- you re-enable sign-in. Or run the inverse script below at the end.
--
-- Paste into the Supabase SQL Editor and Run.
-- ════════════════════════════════════════════════════════════════════

-- ─── ORGS + RESTAURANTS ───
drop policy if exists orgs_anon_all on organizations;
create policy orgs_anon_all on organizations for all using (true) with check (true);

drop policy if exists restaurants_anon_write on restaurants;
create policy restaurants_anon_write on restaurants for all using (true) with check (true);

-- ─── PLATFORM ADMINS + STAFF ───
drop policy if exists padmins_anon_all on platform_admins;
create policy padmins_anon_all on platform_admins for all using (true) with check (true);

drop policy if exists staff_anon_all on restaurant_staff;
create policy staff_anon_all on restaurant_staff for all using (true) with check (true);

-- ─── MENU ───
drop policy if exists categories_anon_write on categories;
create policy categories_anon_write on categories for all using (true) with check (true);

drop policy if exists menu_items_anon_write on menu_items;
create policy menu_items_anon_write on menu_items for all using (true) with check (true);

drop policy if exists menu_variants_anon_write on menu_variants;
create policy menu_variants_anon_write on menu_variants for all using (true) with check (true);

drop policy if exists menu_modifiers_anon_write on menu_modifiers;
create policy menu_modifiers_anon_write on menu_modifiers for all using (true) with check (true);

-- ─── TABLES + AREAS ───
drop policy if exists tables_anon_write on dining_tables;
create policy tables_anon_write on dining_tables for all using (true) with check (true);

drop policy if exists areas_anon_all on dining_areas;
create policy areas_anon_all on dining_areas for all using (true) with check (true);

-- ─── COUPONS ───
drop policy if exists coupons_anon_write on coupons;
create policy coupons_anon_write on coupons for all using (true) with check (true);

-- ─── ORDERS ───
drop policy if exists orders_anon_all on orders;
create policy orders_anon_all on orders for all using (true) with check (true);

drop policy if exists order_items_anon_all on order_items;
create policy order_items_anon_all on order_items for all using (true) with check (true);

drop policy if exists order_status_events_anon_all on order_status_events;
create policy order_status_events_anon_all on order_status_events for all using (true) with check (true);

-- ─── KOT (kitchen) ───
drop policy if exists kot_anon_all on kot_tickets;
create policy kot_anon_all on kot_tickets for all using (true) with check (true);

drop policy if exists kot_items_anon_all on kot_ticket_items;
create policy kot_items_anon_all on kot_ticket_items for all using (true) with check (true);

-- ─── PAYMENTS ───
drop policy if exists payments_anon_all on payments;
create policy payments_anon_all on payments for all using (true) with check (true);

drop policy if exists payment_gateways_anon_all on payment_gateways;
create policy payment_gateways_anon_all on payment_gateways for all using (true) with check (true);

-- ─── RESERVATIONS ───
drop policy if exists reservations_anon_all on reservations;
create policy reservations_anon_all on reservations for all using (true) with check (true);

-- ─── LOYALTY ───
drop policy if exists wallets_anon_all on loyalty_wallets;
create policy wallets_anon_all on loyalty_wallets for all using (true) with check (true);

drop policy if exists txns_anon_all on loyalty_transactions;
create policy txns_anon_all on loyalty_transactions for all using (true) with check (true);

-- ─── CUSTOMER (addresses, preferences, feedback, push tokens) ───
drop policy if exists customers_anon_all on customers;
create policy customers_anon_all on customers for all using (true) with check (true);

drop policy if exists addresses_anon_all on customer_addresses;
create policy addresses_anon_all on customer_addresses for all using (true) with check (true);

drop policy if exists prefs_anon_all on customer_preferences;
create policy prefs_anon_all on customer_preferences for all using (true) with check (true);

drop policy if exists feedback_anon_all on customer_feedback;
create policy feedback_anon_all on customer_feedback for all using (true) with check (true);

drop policy if exists push_anon_all on customer_push_tokens;
create policy push_anon_all on customer_push_tokens for all using (true) with check (true);

-- ─── AUDIT ───
drop policy if exists audit_anon_all on audit_log;
create policy audit_anon_all on audit_log for all using (true) with check (true);

-- ─── POS sessions ───
drop policy if exists pos_anon_all on pos_sessions;
create policy pos_anon_all on pos_sessions for all using (true) with check (true);

-- ════════════════════════════════════════════════════════════════════
-- Verify — should return rows:
-- ════════════════════════════════════════════════════════════════════
-- select count(*) as orgs from organizations;
-- select count(*) as branches from restaurants;
-- select count(*) as menu_items from menu_items;

-- ════════════════════════════════════════════════════════════════════
-- To REVERT this (re-lock everything down before going to production):
--
-- drop policy if exists orgs_anon_all on organizations;
-- drop policy if exists restaurants_anon_write on restaurants;
-- drop policy if exists padmins_anon_all on platform_admins;
-- drop policy if exists staff_anon_all on restaurant_staff;
-- drop policy if exists categories_anon_write on categories;
-- drop policy if exists menu_items_anon_write on menu_items;
-- drop policy if exists menu_variants_anon_write on menu_variants;
-- drop policy if exists menu_modifiers_anon_write on menu_modifiers;
-- drop policy if exists tables_anon_write on dining_tables;
-- drop policy if exists areas_anon_all on dining_areas;
-- drop policy if exists coupons_anon_write on coupons;
-- drop policy if exists orders_anon_all on orders;
-- drop policy if exists order_items_anon_all on order_items;
-- drop policy if exists order_status_events_anon_all on order_status_events;
-- drop policy if exists kot_anon_all on kot_tickets;
-- drop policy if exists kot_items_anon_all on kot_ticket_items;
-- drop policy if exists payments_anon_all on payments;
-- drop policy if exists payment_gateways_anon_all on payment_gateways;
-- drop policy if exists reservations_anon_all on reservations;
-- drop policy if exists wallets_anon_all on loyalty_wallets;
-- drop policy if exists txns_anon_all on loyalty_transactions;
-- drop policy if exists customers_anon_all on customers;
-- drop policy if exists addresses_anon_all on customer_addresses;
-- drop policy if exists prefs_anon_all on customer_preferences;
-- drop policy if exists feedback_anon_all on customer_feedback;
-- drop policy if exists push_anon_all on customer_push_tokens;
-- drop policy if exists audit_anon_all on audit_log;
-- drop policy if exists pos_anon_all on pos_sessions;
