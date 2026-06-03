-- ════════════════════════════════════════════════════════════════════
-- Menu import template — extra columns
--
-- The owner-facing CSV template now matches the columns most Indian
-- F&B sheets use (Nakshatra-style):
--   Sr.no, Item Name, Image, description, Category Name, veg/non-veg,
--   Slash/strike price, Actual Price including Parcel Charges,
--   Parcel Charges, Breakfast/lunch/dinner, Tags, Additional tags,
--   add-ons, add-ons price, half/full, half price, full price, Rating
--
-- Most of those map straight to existing columns. These three are new:
--   • strike_price  — the MRP shown with a strikethrough on menu cards
--   • parcel_charge — extra packing fee added on takeaway orders
--   • meal_time     — breakfast | lunch | dinner | all_day (free-text for now)
--
-- The existing `tags text[]` column (added in migration 0004) already
-- handles the Tags / Additional tags columns.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table menu_items
  add column if not exists strike_price  numeric(10,2),
  add column if not exists parcel_charge numeric(10,2) default 0,
  add column if not exists meal_time     text;

-- Sanity check
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'menu_items'
  and column_name in ('strike_price','parcel_charge','meal_time','tags')
order by column_name;
