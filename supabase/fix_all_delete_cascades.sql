-- ════════════════════════════════════════════════════════════════════
-- Sweep every FK that blocks a branch / organization delete.
--
-- Symptom: deleting from Super Admin → Restaurants aborts with one of
--   • order_items_menu_item_id_fkey         (fixed in fix_menu_item_delete_cascade.sql)
--   • loyalty_transactions_order_id_fkey
--   • payments_order_id_fkey
--   • order_status_events_order_id_fkey
--   • kot_tickets_order_id_fkey
--   • kot_ticket_items_*_fkey
--   • etc.
--
-- Each is a `references orders(id)` (or similar) declared without an
-- `ON DELETE` clause, which defaults to NO ACTION = "refuse if any
-- reference exists". Postgres evaluates these before the cascading
-- delete on the parent finishes, so the whole transaction rolls back.
--
-- Two patterns we use:
--   • CASCADE   — for rows that are tightly coupled to their parent
--                 (KOT tickets, order_items, order_status_events,
--                 payments — they're meaningless without the order).
--   • SET NULL  — for audit-style rows we want to keep even if the
--                 parent is gone (loyalty_transactions — coin awards
--                 stay in the customer's wallet history).
--
-- Idempotent: drops the old constraint by name before re-adding. Safe
-- to re-run any number of times.
-- ════════════════════════════════════════════════════════════════════

-- Tiny helper so the migration reads cleanly. Re-applies an FK with a
-- specific ON DELETE rule if the source table + column exist.
do $$
declare
  r record;
  cmd text;
begin
  for r in
    select * from (values
      -- table              column            ref_table       ref_column   on_delete   constraint_name
      ('order_items',        'order_id',       'orders',        'id',        'CASCADE',  'order_items_order_id_fkey'),
      ('order_status_events','order_id',       'orders',        'id',        'CASCADE',  'order_status_events_order_id_fkey'),
      ('kot_tickets',        'order_id',       'orders',        'id',        'CASCADE',  'kot_tickets_order_id_fkey'),
      ('kot_ticket_items',   'kot_ticket_id',  'kot_tickets',   'id',        'CASCADE',  'kot_ticket_items_kot_ticket_id_fkey'),
      ('payments',           'order_id',       'orders',        'id',        'CASCADE',  'payments_order_id_fkey'),
      ('loyalty_transactions','order_id',      'orders',        'id',        'SET NULL', 'loyalty_transactions_order_id_fkey'),
      ('loyalty_transactions','wallet_id',     'loyalty_wallets','id',       'CASCADE',  'loyalty_transactions_wallet_id_fkey'),
      ('coupons',            'restaurant_id',  'restaurants',   'id',        'CASCADE',  'coupons_restaurant_id_fkey'),
      ('reservations',       'restaurant_id',  'restaurants',   'id',        'CASCADE',  'reservations_restaurant_id_fkey'),
      ('reservations',       'table_id',       'dining_tables', 'id',        'SET NULL', 'reservations_table_id_fkey'),
      ('reservations',       'customer_id',    'customers',     'id',        'SET NULL', 'reservations_customer_id_fkey'),
      ('payment_gateways',   'restaurant_id',  'restaurants',   'id',        'CASCADE',  'payment_gateways_restaurant_id_fkey'),
      ('payments',           'restaurant_id',  'restaurants',   'id',        'CASCADE',  'payments_restaurant_id_fkey'),
      ('payments',           'payment_gateway_id','payment_gateways','id',   'SET NULL', 'payments_payment_gateway_id_fkey')
    ) as t(table_name, column_name, ref_table, ref_column, on_delete, constraint_name)
  loop
    -- Skip silently if the source table or column doesn't exist
    -- (e.g. feature_pack hasn't been applied on this DB).
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = r.table_name
        and column_name = r.column_name
    ) then
      raise notice 'skip: %.% does not exist', r.table_name, r.column_name;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = r.ref_table
        and column_name = r.ref_column
    ) then
      raise notice 'skip: ref %.% does not exist', r.ref_table, r.ref_column;
      continue;
    end if;

    cmd := format(
      'alter table public.%I drop constraint if exists %I',
      r.table_name, r.constraint_name
    );
    execute cmd;

    cmd := format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%I(%I) on delete %s',
      r.table_name, r.constraint_name, r.column_name, r.ref_table, r.ref_column, r.on_delete
    );
    execute cmd;

    raise notice 'fixed: %.% → %.% (% )', r.table_name, r.column_name, r.ref_table, r.ref_column, r.on_delete;
  end loop;
end$$;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY (run in a SECOND query so the catalog updates are committed)
--
-- The expected output is every FK above with the right delete_rule.
-- ════════════════════════════════════════════════════════════════════
--
-- select tc.table_name, kcu.column_name,
--        ccu.table_name as references_table,
--        ccu.column_name as references_column,
--        rc.delete_rule
-- from information_schema.table_constraints tc
-- join information_schema.referential_constraints rc using (constraint_name, constraint_schema)
-- join information_schema.key_column_usage kcu using (constraint_name, constraint_schema)
-- join information_schema.constraint_column_usage ccu using (constraint_name, constraint_schema)
-- where tc.constraint_schema = 'public'
--   and tc.table_name in (
--     'order_items','order_status_events','kot_tickets','kot_ticket_items',
--     'payments','loyalty_transactions','coupons','reservations','payment_gateways'
--   )
-- order by tc.table_name, kcu.column_name;
