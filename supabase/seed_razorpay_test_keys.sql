-- ════════════════════════════════════════════════════════════════════
-- One-shot: enable Razorpay platform-wide + pre-fill the supplied test
-- key into every branch's gateway row.
--
-- ⚠️  These are Razorpay TEST keys (rzp_test_…). Safe to commit / share —
--    no real money flows. Replace with live keys via Admin → Payment Keys
--    before going to production.
--
-- Paste into Supabase SQL Editor → Run. Idempotent.
-- ════════════════════════════════════════════════════════════════════

-- 1. Make sure payment_providers row exists with the right enabled state.
create table if not exists payment_providers (
  provider     payment_provider primary key,
  display_name text    not null,
  tagline      text,
  is_enabled   boolean not null default false,
  created_at   timestamptz default now()
);

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

alter table payment_providers disable row level security;
grant select, insert, update, delete on payment_providers to anon, authenticated;

-- 2. Ensure payment_gateways has secret_key column (added in payment_gateway.sql).
alter table payment_gateways add column if not exists secret_key text;

-- 3. Pre-fill the supplied test Razorpay keys into every branch.
--    Upserts on (restaurant_id, provider). Sets is_active = true + test_mode = true.
insert into payment_gateways (
  restaurant_id, provider, key_id, secret_key, is_active, is_primary, test_mode
)
select
  r.id,
  'razorpay'::payment_provider,
  'rzp_test_Sspu8DVzpu4KkQ',
  '7HbU7nDE9KWy97rHpJfu2Ak5',
  true,    -- active
  true,    -- primary
  true     -- test mode
from restaurants r
on conflict (restaurant_id, provider) do update set
  key_id     = excluded.key_id,
  secret_key = excluded.secret_key,
  is_active  = true,
  is_primary = true,
  test_mode  = true;

-- 4. Verify — should return one row per branch, all with the same key_id.
select
  r.name        as branch,
  pg.provider,
  pg.key_id,
  pg.is_active,
  pg.test_mode
from payment_gateways pg
join restaurants r on r.id = pg.restaurant_id
where pg.provider = 'razorpay'
order by r.name;
