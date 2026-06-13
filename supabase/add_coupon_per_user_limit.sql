-- ──────────────────────────────────────────────────────────────────────────────
-- add_coupon_per_user_limit.sql
--
-- Per-customer redemption cap on coupons. NULL = unlimited (existing
-- behaviour). Set to 1 for "one-time use per user" launch promos.
--
-- Enforcement happens client-side on the customer app: it counts the user's
-- previous orders where coupon_id matches, and filters out the coupon from the
-- auto-apply list when the cap is reached. The admin UI also surfaces a
-- "unique users redeemed" stat per coupon, derived from the orders table.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.coupons
  add column if not exists per_user_limit integer;

comment on column public.coupons.per_user_limit is
  'Max times a single customer can redeem this coupon. NULL = unlimited.';
