-- ════════════════════════════════════════════════════════════════════
-- Combos: marks a menu_items row as a combo / value deal.
--
-- Combos are listed under a dedicated "Combos" tab on the customer menu
-- and feed the smart-sell engine on the cart ("Your cart is ₹150 — add
-- ₹50 for the Family Combo ₹200").
--
-- v1 keeps the schema small: a combo is just a regular menu_items row
-- with `is_combo = true`. The admin describes what's bundled in the
-- existing description field; the kitchen reads the description on the
-- KOT. A future version may add a combo_items jsonb (array of
-- {menu_item_id, qty}) so the kitchen sees the sub-items explicitly.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

alter table menu_items
  add column if not exists is_combo boolean default false;

create index if not exists menu_items_combo_idx
  on menu_items (restaurant_id, is_combo)
  where is_combo = true;

select id, slug, name, count(*) filter (where mi.is_combo) over (partition by mi.restaurant_id) as combo_count
from menu_items mi
join restaurants r on r.id = mi.restaurant_id
where mi.is_combo = true
order by r.slug, mi.name
limit 30;
