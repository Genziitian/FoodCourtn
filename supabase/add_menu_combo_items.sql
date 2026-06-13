-- ──────────────────────────────────────────────────────────────────────────────
-- add_menu_combo_items.sql
--
-- A combo is just a menu_items row with is_combo=true. This column stores the
-- list of constituent items that make up the combo, so the customer can see
-- "Includes: Chicken Dum Biryani + Masala Chai" on the combo card, and the
-- admin's Combos builder can render the picker.
--
-- Shape:
--   [
--     { "menu_item_id": "uuid-1", "quantity": 1 },
--     { "menu_item_id": "uuid-2", "quantity": 2 }
--   ]
--
-- Stored as jsonb (not a join table) because:
--   - Combos rarely change after creation; bulk-rewrite on save is fine.
--   - Reads always need ALL items together — no need for relational joins.
--   - One column survives backfills cleanly (no orphan rows on FK breaks).
--
-- Safe to run multiple times.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.menu_items
  add column if not exists combo_items jsonb default '[]'::jsonb;

comment on column public.menu_items.combo_items is
  'For combo rows (is_combo=true): array of {menu_item_id, quantity} pointing at the constituent menu items.';
