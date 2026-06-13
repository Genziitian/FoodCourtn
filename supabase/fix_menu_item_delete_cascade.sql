-- ════════════════════════════════════════════════════════════════════
-- Fix: deleting a branch (or a single menu item) was blocked by FK
-- constraints on order_items.menu_item_id and customer_feedback.menu_item_id.
--
-- Original schema:
--   alter table order_items
--     add constraint order_items_menu_item_id_fkey
--     foreign key (menu_item_id) references menu_items(id);   -- NO ACTION → blocks
--
-- That clause means Postgres refuses to drop a menu_items row as long as ANY
-- order_items row references it. When a super admin deletes a branch, the
-- restaurants → menu_items cascade runs, hits the FK, and rolls back with:
--   update or delete on table "menu_items" violates foreign key constraint
--   "order_items_menu_item_id_fkey" on table "order_items"
--
-- Fix: switch both FKs to ON DELETE SET NULL. order_items rows survive (their
-- `item_name` snapshot keeps reporting accurate); only the backlink is
-- dropped. Same for customer_feedback. Now branch deletion cascades cleanly,
-- and order history stays intact for accounting/reports.
--
-- Idempotent: drops the old constraint name (if it exists) before re-adding.
-- ════════════════════════════════════════════════════════════════════

-- ── order_items.menu_item_id → SET NULL ──
alter table order_items
  drop constraint if exists order_items_menu_item_id_fkey;

alter table order_items
  alter column menu_item_id drop not null;     -- allow NULL after a parent is deleted

alter table order_items
  add constraint order_items_menu_item_id_fkey
  foreign key (menu_item_id)
  references menu_items(id)
  on delete set null;

-- ── order_items.variant_id → SET NULL (same problem, smaller blast radius) ──
alter table order_items
  drop constraint if exists order_items_variant_id_fkey;

alter table order_items
  add constraint order_items_variant_id_fkey
  foreign key (variant_id)
  references menu_variants(id)
  on delete set null;

-- ── customer_feedback.menu_item_id → SET NULL (only present if feature_pack ran) ──
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_feedback'
      and column_name = 'menu_item_id'
  ) then
    execute 'alter table customer_feedback drop constraint if exists customer_feedback_menu_item_id_fkey';
    execute 'alter table customer_feedback add constraint customer_feedback_menu_item_id_fkey
              foreign key (menu_item_id) references menu_items(id) on delete set null';
  end if;
end$$;

-- ── Verify the new ON DELETE rules ──
select
  tc.table_name,
  kcu.column_name,
  rc.delete_rule
from information_schema.referential_constraints rc
join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
join information_schema.key_column_usage kcu on kcu.constraint_name = rc.constraint_name
where rc.constraint_schema = 'public'
  and tc.table_name in ('order_items', 'customer_feedback')
  and kcu.column_name in ('menu_item_id', 'variant_id')
order by tc.table_name, kcu.column_name;
