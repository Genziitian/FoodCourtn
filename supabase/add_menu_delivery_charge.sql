-- ════════════════════════════════════════════════════════════════════
-- Per-item delivery_charge column.
--
-- Companion to `parcel_charge` (used on takeaway). Owners can now set a
-- different per-unit fee for delivery — e.g. a Biryani might cost ₹15 to
-- box for takeaway and ₹25 to deliver hot. The customer cart sums these
-- when the order_type is 'delivery'.
--
-- Falls back to the flat `restaurants.settings.delivery_fee` when no line
-- in the cart has a per-unit delivery charge set (so old menus still work).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

alter table menu_items
  add column if not exists delivery_charge numeric(10,2) default 0;

-- Sanity check
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'menu_items'
  and column_name in ('parcel_charge', 'delivery_charge')
order by column_name;
