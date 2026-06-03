-- ════════════════════════════════════════════════════════════════════
-- Default Razorpay test keys for every branch — v2 (new keys).
--
-- Does three things:
--   1. Backfills every existing branch with the supplied Razorpay TEST keys
--      (overwrites any previous value in the same row — `on conflict do update`).
--   2. Installs a trigger so every NEW branch automatically gets the same
--      default Razorpay gateway row at insert time. Zero-touch onboarding.
--   3. Re-runs the platform_providers `is_enabled` setup so the customer
--      checkout knows Razorpay is allowed.
--
-- ⚠️  These are Razorpay TEST keys (rzp_test_…). No real money moves.
--    For production: org admins replace these via Admin → Payment Keys
--    (the upsert UI sets test_mode=false and writes their own live keys).
--
-- Paste into Supabase → SQL Editor → Run. Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- 0. Make sure the secret_key column exists (added by payment_gateway.sql).
alter table payment_gateways add column if not exists secret_key text;

-- 1. Platform providers — Razorpay must be enabled or the customer cart
--    won't open it. Idempotent insert.
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

-- 2. Backfill existing branches with the NEW Razorpay test keys.
insert into payment_gateways (
  restaurant_id, provider, key_id, secret_key, is_active, is_primary, test_mode
)
select
  r.id,
  'razorpay'::payment_provider,
  'rzp_test_SwpIiR1lJQEbRT',
  'MOkTIhVIRaQLBE8S66tyzcFe',
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

-- 3. Trigger: every NEW restaurant gets the default Razorpay row created
--    automatically. Defined with SECURITY DEFINER so it works regardless of
--    who inserted the restaurant (super admin via JWT, RPC, etc.).
create or replace function seed_default_razorpay_for_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into payment_gateways (
    restaurant_id, provider, key_id, secret_key, is_active, is_primary, test_mode
  )
  values (
    new.id,
    'razorpay'::payment_provider,
    'rzp_test_SwpIiR1lJQEbRT',
    'MOkTIhVIRaQLBE8S66tyzcFe',
    true,    -- active
    true,    -- primary
    true     -- test mode
  )
  on conflict (restaurant_id, provider) do nothing;
  return new;
end;
$fn$;

drop trigger if exists trg_seed_default_razorpay on restaurants;
create trigger trg_seed_default_razorpay
  after insert on restaurants
  for each row execute function seed_default_razorpay_for_branch();

-- 4. Verify — should list every branch with the new key_id.
select
  r.name        as branch,
  pg.provider,
  pg.key_id,
  pg.is_active,
  pg.is_primary,
  pg.test_mode
from payment_gateways pg
join restaurants r on r.id = pg.restaurant_id
where pg.provider = 'razorpay'
order by r.name;
