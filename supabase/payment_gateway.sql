-- ════════════════════════════════════════════════════════════════════
-- Payment gateway plumbing
--
-- 1. payment_providers — platform-level enable/disable per provider.
--    Super admin toggles which providers branches are allowed to use.
--
-- 2. payment_gateways.secret_key — per-branch secret. (Dev convenience —
--    in production move to Supabase Vault + an Edge Function that signs
--    Razorpay requests server-side. Never expose the secret to the client.)
--
-- 3. RPCs:
--    • set_provider_enabled(provider, enabled)  — super admin
--    • get_branch_payment_key(restaurant_id)    — customer (returns key_id
--      only, never the secret)
--
-- Paste into Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

-- ─── Platform-level provider registry ───
create table if not exists payment_providers (
  provider     payment_provider primary key,
  display_name text    not null,
  tagline      text,
  is_enabled   boolean not null default false,
  created_at   timestamptz default now()
);

-- Seed Razorpay only for MVP. Disabled by default — super admin enables when keys are in.
insert into payment_providers (provider, display_name, tagline, is_enabled) values
  ('razorpay', 'Razorpay', 'UPI, Cards, Netbanking, Wallets — India', false)
on conflict (provider) do nothing;

-- Other providers exist in the enum but aren't surfaced to branches yet.
insert into payment_providers (provider, display_name, tagline, is_enabled) values
  ('stripe',   'Stripe',   'International cards',              false),
  ('phonepe',  'PhonePe',  'UPI-first, PhonePe wallet',        false),
  ('paytm',    'Paytm',    'Wallets, UPI',                     false),
  ('cashfree', 'Cashfree', 'UPI, Cards, Payouts',              false)
on conflict (provider) do nothing;

-- Open RLS for the payment_providers table so the apps can read it.
alter table payment_providers disable row level security;

-- ─── Per-branch secret storage (dev convenience) ───
alter table payment_gateways add column if not exists secret_key text;

-- ─── RPC: super admin toggles a provider's availability platform-wide ───
create or replace function set_provider_enabled(p payment_provider, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update payment_providers set is_enabled = enabled where provider = p;
end;
$fn$;

grant execute on function set_provider_enabled(payment_provider, boolean) to anon, authenticated;

-- ─── RPC: get the active payment key for a branch ───
-- Returns the PRIMARY active gateway for the given branch, but only if the
-- platform provider is enabled. Never returns the secret_key.
create or replace function get_branch_payment_key(rid uuid)
returns table (provider payment_provider, key_id text, test_mode boolean)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
  select g.provider, g.key_id, g.test_mode
  from payment_gateways g
  join payment_providers p on p.provider = g.provider and p.is_enabled = true
  where g.restaurant_id = rid
    and g.is_active = true
  order by g.is_primary desc nulls last, g.created_at desc
  limit 1;
end;
$fn$;

grant execute on function get_branch_payment_key(uuid) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Verify:
-- ════════════════════════════════════════════════════════════════════
-- select * from payment_providers;
-- select * from payment_gateways;
