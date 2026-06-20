-- ──────────────────────────────────────────────────────────────────────────────
-- add_menu_stock_qty.sql
--
-- Stock-level inventory for menu items.
--
-- Two new columns:
--   stock_qty            integer  -- units available. NULL = untracked (legacy
--                                    behaviour: in_stock flag controls visibility).
--   low_stock_threshold  integer  -- below this → admin gets a warning badge.
--
-- Trigger logic:
--   • on order_items INSERT  → stock_qty -= qty for non-cancelled orders
--   • on order_items DELETE  → stock_qty += qty
--   • when stock_qty hits 0  → in_stock = false (auto-hide on customer)
--   • when stock_qty restocks above 0 (manual update) → in_stock = true if
--     the admin hasn't explicitly forced it off.
--
-- We don't decrement on cancelled orders: order_items deletion handles that
-- when the order is voided. Soft-cancel (status='cancelled' but row stays)
-- needs a separate path — see also fix in orders status trigger.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.menu_items
  add column if not exists stock_qty integer,
  add column if not exists low_stock_threshold integer default 5;

comment on column public.menu_items.stock_qty is
  'Unit count for stock-level inventory. NULL = untracked (use in_stock flag instead).';
comment on column public.menu_items.low_stock_threshold is
  'Below this stock_qty, admin gets a low-stock warning. Default 5.';

-- ── Trigger function ──────────────────────────────────────────────────────────
create or replace function public.fn_consume_stock_on_order_item()
returns trigger language plpgsql as $$
declare
  cur_stock integer;
begin
  if (tg_op = 'INSERT') then
    -- Decrement only if the menu item tracks stock.
    update public.menu_items
       set stock_qty = greatest(0, coalesce(stock_qty, 0) - new.qty),
           in_stock  = case
             when stock_qty is null then in_stock         -- untracked: don't touch
             when coalesce(stock_qty, 0) - new.qty <= 0 then false
             else in_stock
           end
     where id = new.menu_item_id and stock_qty is not null
     returning stock_qty into cur_stock;
    return new;

  elsif (tg_op = 'DELETE') then
    -- Order item removed (void / refund) — re-credit the stock.
    update public.menu_items
       set stock_qty = coalesce(stock_qty, 0) + old.qty,
           in_stock  = case
             when stock_qty is null then in_stock
             when coalesce(stock_qty, 0) + old.qty > 0 then true
             else in_stock
           end
     where id = old.menu_item_id and stock_qty is not null;
    return old;
  end if;

  return null;
end$$;

drop trigger if exists tr_order_items_consume_stock on public.order_items;
create trigger tr_order_items_consume_stock
  after insert or delete on public.order_items
  for each row execute function public.fn_consume_stock_on_order_item();

-- ── Order cancellation: re-credit stock if the order status flips to
--    'cancelled' but the order_items rows stay (soft-cancel pattern).
create or replace function public.fn_restock_on_order_cancel()
returns trigger language plpgsql as $$
begin
  if (new.status = 'cancelled' and old.status <> 'cancelled') then
    update public.menu_items mi
       set stock_qty = coalesce(mi.stock_qty, 0) + oi.qty,
           in_stock  = true
      from public.order_items oi
     where oi.order_id = new.id
       and mi.id = oi.menu_item_id
       and mi.stock_qty is not null;
  end if;
  return new;
end$$;

drop trigger if exists tr_orders_restock_on_cancel on public.orders;
create trigger tr_orders_restock_on_cancel
  after update of status on public.orders
  for each row execute function public.fn_restock_on_order_cancel();
