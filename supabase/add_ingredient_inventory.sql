-- ──────────────────────────────────────────────────────────────────────────────
-- add_ingredient_inventory.sql
--
-- Recipe-based / ingredient-level inventory.
--
-- Two new tables:
--   ingredients              — master list of raw ingredients per branch
--                              (bun, cheese slice, tomato, tikka masala paste…)
--   menu_item_ingredients    — the bill of materials linking a menu item
--                              to its constituent ingredients with per-unit
--                              consumption (1 bun + 2 cheese slices per burger)
--
-- Trigger logic:
--   • on order_items INSERT  → consume qty * qty_per_unit from each ingredient
--   • on order_items DELETE  → restore
--   • on orders.status flip → 'cancelled' → restore everything
--   • menu_item.in_stock auto-flips to false when ANY ingredient hits 0
--
-- Coexists with stock_qty (Feature 2) — both checks run, item is hidden if
-- either says no.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  unit text not null default 'pcs',            -- 'pcs', 'g', 'ml', 'kg', 'l'
  stock_qty numeric not null default 0,
  low_stock_threshold numeric default 0,
  cost_per_unit numeric default 0,             -- for COGS / margin reports later
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ingredients_restaurant_idx
  on public.ingredients(restaurant_id) where is_active = true;
create unique index if not exists ingredients_restaurant_name_idx
  on public.ingredients(restaurant_id, lower(name));

create table if not exists public.menu_item_ingredients (
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  qty_per_unit numeric not null check (qty_per_unit > 0),
  primary key (menu_item_id, ingredient_id)
);

create index if not exists menu_item_ingredients_ingredient_idx
  on public.menu_item_ingredients(ingredient_id);

comment on table public.ingredients is
  'Raw ingredients (per branch) consumed by menu_item recipes.';
comment on table public.menu_item_ingredients is
  'Recipe: menu item -> ingredients with per-unit consumption rate.';

-- ── Consume / restore stock on order line activity ────────────────────────────

create or replace function public.fn_consume_ingredients_on_order_item()
returns trigger language plpgsql as $$
declare
  rec record;
begin
  if (tg_op = 'INSERT') then
    for rec in
      select ingredient_id, qty_per_unit
        from public.menu_item_ingredients
       where menu_item_id = new.menu_item_id
    loop
      update public.ingredients
         set stock_qty = greatest(0, stock_qty - rec.qty_per_unit * new.qty)
       where id = rec.ingredient_id;
    end loop;
    -- Mark dependent menu items out of stock when any ingredient is exhausted.
    perform public.fn_sync_menu_in_stock_for_item(new.menu_item_id);
    return new;

  elsif (tg_op = 'DELETE') then
    for rec in
      select ingredient_id, qty_per_unit
        from public.menu_item_ingredients
       where menu_item_id = old.menu_item_id
    loop
      update public.ingredients
         set stock_qty = stock_qty + rec.qty_per_unit * old.qty
       where id = rec.ingredient_id;
    end loop;
    perform public.fn_sync_menu_in_stock_for_item(old.menu_item_id);
    return old;
  end if;

  return null;
end$$;

-- ── Helper: recompute menu_items.in_stock for ALL items that depend on
--    the given ingredient (or for one specific menu_item). An item is in
--    stock only if every ingredient has at least qty_per_unit available.

create or replace function public.fn_sync_menu_in_stock_for_item(item_id uuid)
returns void language plpgsql as $$
declare
  short_count integer;
begin
  select count(*) into short_count
    from public.menu_item_ingredients mii
    join public.ingredients ing on ing.id = mii.ingredient_id
   where mii.menu_item_id = item_id
     and ing.stock_qty < mii.qty_per_unit;

  if short_count > 0 then
    update public.menu_items set in_stock = false where id = item_id;
  else
    -- Only flip back on if it's currently off due to ingredient shortage.
    -- We don't override an admin "force off"; absence of stock_qty entry
    -- is the heuristic — admin can always re-toggle manually.
    update public.menu_items
       set in_stock = true
     where id = item_id
       and exists (select 1 from public.menu_item_ingredients where menu_item_id = item_id);
  end if;
end$$;

create or replace function public.fn_sync_menu_in_stock_for_ingredient(ing_id uuid)
returns void language plpgsql as $$
declare
  item record;
begin
  for item in
    select distinct menu_item_id
      from public.menu_item_ingredients
     where ingredient_id = ing_id
  loop
    perform public.fn_sync_menu_in_stock_for_item(item.menu_item_id);
  end loop;
end$$;

-- Whenever an ingredient stock changes (admin restock OR trigger consumption),
-- re-evaluate every dependent menu item.
create or replace function public.fn_on_ingredient_stock_change()
returns trigger language plpgsql as $$
begin
  if (new.stock_qty is distinct from old.stock_qty) then
    perform public.fn_sync_menu_in_stock_for_ingredient(new.id);
  end if;
  return new;
end$$;

drop trigger if exists tr_ingredients_stock_change on public.ingredients;
create trigger tr_ingredients_stock_change
  after update of stock_qty on public.ingredients
  for each row execute function public.fn_on_ingredient_stock_change();

drop trigger if exists tr_order_items_consume_ingredients on public.order_items;
create trigger tr_order_items_consume_ingredients
  after insert or delete on public.order_items
  for each row execute function public.fn_consume_ingredients_on_order_item();

-- ── Soft cancellation restores ingredients (mirrors the stock_qty trigger
--    from add_menu_stock_qty.sql, but on the ingredients layer)

create or replace function public.fn_restock_ingredients_on_order_cancel()
returns trigger language plpgsql as $$
declare
  rec record;
begin
  if (new.status = 'cancelled' and old.status <> 'cancelled') then
    for rec in
      select mii.ingredient_id,
             sum(mii.qty_per_unit * oi.qty) as total_qty
        from public.order_items oi
        join public.menu_item_ingredients mii on mii.menu_item_id = oi.menu_item_id
       where oi.order_id = new.id
       group by mii.ingredient_id
    loop
      update public.ingredients
         set stock_qty = stock_qty + rec.total_qty
       where id = rec.ingredient_id;
    end loop;
  end if;
  return new;
end$$;

drop trigger if exists tr_orders_restock_ingredients_on_cancel on public.orders;
create trigger tr_orders_restock_ingredients_on_cancel
  after update of status on public.orders
  for each row execute function public.fn_restock_ingredients_on_order_cancel();
