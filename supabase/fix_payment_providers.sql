-- ════════════════════════════════════════════════════════════════════
-- Fix: payment_providers table empty / unreachable
--
-- Symptoms:
--   • Super Admin → Payment Integrations shows "0 of 0 available" and an
--     empty provider list (no Razorpay / PhonePe / etc. rows to toggle).
--   • Admin → Payment Keys says "No payment providers are enabled" even
--     though branches already have key configurations.
--
-- Causes (any of):
--   • `payment_gateway.sql` was never run, so the providers table is empty.
--   • Providers were seeded with is_enabled = false and never flipped on.
--   • The anon role lacks SELECT permission on payment_providers.
--
-- This script ensures all five rows exist, Razorpay + PhonePe + Paytm +
-- Cashfree are enabled (Stripe is intentionally off until a server-side
-- Edge Function is in place), RLS is off, and grants are correct.
--
-- Paste into Supabase SQL Editor → Run. Idempotent.
-- ════════════════════════════════════════════════════════════════════

-- 1. Make sure the table exists. (No-op if payment_gateway.sql already ran.)
create table if not exists payment_providers (
  provider     payment_provider primary key,
  display_name text    not null,
  tagline      text,
  is_enabled   boolean not null default false,
  created_at   timestamptz default now()
);

-- 2. Seed all five rows with the desired enabled state. Re-runs flip the
--    is_enabled to match this script's values.
insert into payment_providers (provider, display_name, tagline, is_enabled) values
  ('razorpay', 'Razorpay', 'UPI, Cards, Netbanking, Wallets — India', true),
  ('phonepe',  'PhonePe',  'UPI-first, PhonePe wallet',               true),
  ('paytm',    'Paytm',    'Wallets, UPI',                            true),
  ('cashfree', 'Cashfree', 'UPI, Cards, Payouts',                     true),
  ('stripe',   'Stripe',   'International cards',                     false)
on conflict (provider) do update set
  display_name = excluded.display_name,
  tagline      = excluded.tagline,
  is_enabled   = excluded.is_enabled;

-- 3. RLS off + table-level grants for both roles. Without these the anon
--    Supabase client SELECT returns nothing (silently) and the UI shows 0.
alter table payment_providers disable row level security;
grant select, insert, update, delete on payment_providers to anon, authenticated;

-- 4. Also auto-seed payment_gateways stub rows for every (branch × enabled
--    provider) so admins can fill keys without "+ Connect" first.
insert into payment_gateways (restaurant_id, provider, key_id, is_active, is_primary, test_mode)
select r.id, p.provider, '', false, false, true
from restaurants r
cross join payment_providers p
where p.is_enabled = true
on conflict (restaurant_id, provider) do nothing;

-- ════════════════════════════════════════════════════════════════════
-- Verify — should return 5 rows, 4 with is_enabled = true.
-- ════════════════════════════════════════════════════════════════════
select provider, display_name, is_enabled
from payment_providers
order by display_name;
