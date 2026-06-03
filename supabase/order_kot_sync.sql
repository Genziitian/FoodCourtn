-- ════════════════════════════════════════════════════════════════════
-- Sync orders.status <-> kot_tickets.status automatically.
--
-- Status mapping:
--   KOT 'new'      ⇔  Order 'received'
--   KOT 'cooking'  ⇔  Order 'preparing'
--   KOT 'ready'    ⇔  Order 'ready'
--   KOT 'complete' ⇔  Order 'completed'
--
-- Without these triggers:
--   • KDS click "Start Cooking" → kot 'cooking'    → orders.status stays 'received'
--   • Admin click "Start Preparing" → orders 'preparing' → kot.status stays 'new'
--   • Customer tracking and KDS show stale state.
--
-- pg_trigger_depth() guard prevents the two triggers from looping.
--
-- Paste into Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

-- ─── KOT → Order ───
create or replace function sync_kot_to_order()
returns trigger
language plpgsql
as $fn$
declare
  new_order_status order_status;
begin
  -- Don't re-fire when we're inside another trigger (prevents the loop).
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.status is distinct from old.status then
    new_order_status := case new.status
      when 'new'      then 'received'::order_status
      when 'cooking'  then 'preparing'::order_status
      when 'ready'    then 'ready'::order_status
      when 'complete' then 'completed'::order_status
    end;

    if new_order_status is not null then
      update orders
      set status = new_order_status
      where id = new.order_id
        and status is distinct from new_order_status;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists kot_status_sync on kot_tickets;
create trigger kot_status_sync
after update of status on kot_tickets
for each row execute function sync_kot_to_order();


-- ─── Order → KOT ───
create or replace function sync_order_to_kot()
returns trigger
language plpgsql
as $fn$
declare
  new_kot_status kot_status;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.status is distinct from old.status then
    new_kot_status := case new.status
      when 'received'  then 'new'::kot_status
      when 'preparing' then 'cooking'::kot_status
      when 'ready'     then 'ready'::kot_status
      when 'completed' then 'complete'::kot_status
      when 'cancelled' then 'complete'::kot_status  -- clear from KDS
    end;

    if new_kot_status is not null then
      update kot_tickets
      set status = new_kot_status
      where order_id = new.id
        and status is distinct from new_kot_status;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists order_status_sync on orders;
create trigger order_status_sync
after update of status on orders
for each row execute function sync_order_to_kot();


-- ════════════════════════════════════════════════════════════════════
-- Realtime: make sure both tables stream changes to the client.
-- (Supabase Realtime requires the table to be in supabase_realtime publication.)
-- ════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'kot_tickets'
  ) then
    alter publication supabase_realtime add table kot_tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'order_status_events'
  ) then
    alter publication supabase_realtime add table order_status_events;
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════
-- Quick verify — picks any order, flips its status, and checks the KOT followed.
-- (Comment out before running if you don't want a side-effect.)
-- ════════════════════════════════════════════════════════════════════
-- select o.code, o.status as order_status, k.ticket_no, k.status as kot_status
-- from orders o left join kot_tickets k on k.order_id = o.id
-- order by o.created_at desc limit 5;
