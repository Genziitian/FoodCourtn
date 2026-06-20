-- ──────────────────────────────────────────────────────────────────────────────
-- add_upsell_targets.sql
--
-- Per-item add-on suggestions ("Add fries for ₹49?" popup after Add-to-Cart).
--
-- One trigger menu_item can have multiple add-ons. Each add-on points at
-- another menu_item to add (we don't duplicate name/price — they live on
-- menu_items and stay in sync as the admin edits them).
--
-- Distinct from combos: combos are bundled SKUs sold at a discount. Add-ons
-- are upsell suggestions of regular menu items.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.upsell_targets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  trigger_item_id uuid not null references public.menu_items(id) on delete cascade,
  suggested_item_id uuid not null references public.menu_items(id) on delete cascade,
  prompt_text text,                                     -- "Add fries for ₹49?"
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  -- An item shouldn't suggest itself.
  constraint upsell_no_self_reference check (trigger_item_id <> suggested_item_id),
  -- One suggestion per (trigger, suggested) pair.
  constraint upsell_unique_pair unique (trigger_item_id, suggested_item_id)
);

create index if not exists upsell_targets_trigger_idx
  on public.upsell_targets(trigger_item_id) where is_active = true;
create index if not exists upsell_targets_restaurant_idx
  on public.upsell_targets(restaurant_id);

comment on table public.upsell_targets is
  'Per-trigger-item add-on suggestions shown after Add-to-Cart on the customer app.';
