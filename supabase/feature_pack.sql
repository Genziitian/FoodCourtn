-- ════════════════════════════════════════════════════════════════════
-- Feature pack — full pass.
--
--  1. Wipe demo ratings; ratings rebuild from real customer_feedback.
--  2. Allow customer_feedback to reference a menu_item (optional).
--  3. Trigger to recalc menu_items.rating + restaurants.rating on feedback.
--  4. Open customer_feedback RLS for anon insert.
--  5. Org platform fee = flat amount (commission_percent kept = 0).
--  6. Enable Razorpay / PhonePe / Paytm / Cashfree by default for all branches:
--     • All 4 platform providers flipped is_enabled = true.
--     • Stub payment_gateways row inserted for every (restaurant, provider).
--       Admin just fills the Key ID + Secret in Settings → Payments.
--  7. Support tickets table + RPCs (admin raises → super admin sees).
--  8. Per-weekday business hours on restaurants.settings (hours_weekly).
--
-- Paste into Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Wipe demo ratings ───
update menu_items set rating = 0, rating_count = 0;
update restaurants set rating = 0, review_count = 0;

-- ─── 2. customer_feedback per-item link ───
alter table customer_feedback
  add column if not exists menu_item_id uuid references menu_items(id);

create index if not exists customer_feedback_menu_item_idx
  on customer_feedback (menu_item_id) where menu_item_id is not null;

-- ─── 3. Recalc trigger ───
create or replace function recalc_rating_from_feedback()
returns trigger
language plpgsql
as $fn$
declare
  r_avg numeric;
  r_cnt int;
  rid uuid;
  mid uuid;
begin
  rid := coalesce(new.restaurant_id, old.restaurant_id);
  mid := coalesce(new.menu_item_id, old.menu_item_id);

  -- Restaurant-level rollup
  select round(avg(rating)::numeric, 1), count(*)
    into r_avg, r_cnt
  from customer_feedback
  where restaurant_id = rid and rating is not null;

  update restaurants
  set rating = coalesce(r_avg, 0),
      review_count = coalesce(r_cnt, 0)
  where id = rid;

  -- Per-item rollup (only if linked)
  if mid is not null then
    select round(avg(rating)::numeric, 1), count(*)
      into r_avg, r_cnt
    from customer_feedback
    where menu_item_id = mid and rating is not null;
    update menu_items
    set rating = coalesce(r_avg, 0),
        rating_count = coalesce(r_cnt, 0)
    where id = mid;
  end if;

  return new;
end;
$fn$;

drop trigger if exists feedback_rating_recalc on customer_feedback;
create trigger feedback_rating_recalc
after insert or update or delete on customer_feedback
for each row execute function recalc_rating_from_feedback();

-- ─── 4. Anon access to customer_feedback ───
alter table customer_feedback disable row level security;

-- ─── 5. Flat platform fee ───
alter table organizations
  add column if not exists flat_platform_fee numeric(10,2) not null default 0;
update organizations set commission_percent = 0 where commission_percent is null;

-- ─── 6. Enable all 4 payment providers + auto-seed gateways per branch ───
update payment_providers
   set is_enabled = true
 where provider in ('razorpay', 'cashfree', 'paytm', 'phonepe');

-- For every existing branch × every enabled provider, insert a stub row.
-- Stub rows are is_active = false until admin fills the key. is_primary
-- flips automatically when admin saves.
insert into payment_gateways (restaurant_id, provider, key_id, is_active, is_primary, test_mode)
select r.id, p.provider, '', false, false, true
from restaurants r
cross join payment_providers p
where p.is_enabled = true
on conflict (restaurant_id, provider) do nothing;

-- Auto-seed gateways for any future branch via trigger
create or replace function seed_gateways_for_new_branch()
returns trigger
language plpgsql
as $fn$
begin
  insert into payment_gateways (restaurant_id, provider, key_id, is_active, is_primary, test_mode)
  select new.id, p.provider, '', false, false, true
  from payment_providers p
  where p.is_enabled = true
  on conflict (restaurant_id, provider) do nothing;
  return new;
end;
$fn$;

drop trigger if exists branch_seed_gateways on restaurants;
create trigger branch_seed_gateways
after insert on restaurants
for each row execute function seed_gateways_for_new_branch();

-- ─── 7. Support tickets ───
-- Postgres has no "create type if not exists" — guard with pg_type lookup.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ticket_priority') then
    create type ticket_priority as enum ('urgent', 'high', 'normal', 'low');
  end if;
  if not exists (select 1 from pg_type where typname = 'ticket_status') then
    create type ticket_status as enum ('open', 'pending', 'resolved', 'closed');
  end if;
end $$;

create table if not exists support_tickets (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid references restaurants(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  raised_by       text,                              -- email or display name
  subject         text not null,
  body            text,
  priority        ticket_priority not null default 'normal',
  status          ticket_status not null default 'open',
  resolution      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists support_tickets_status_idx on support_tickets (status, created_at desc);
create index if not exists support_tickets_org_idx    on support_tickets (organization_id, created_at desc);

drop trigger if exists support_tickets_touch on support_tickets;
create trigger support_tickets_touch before update on support_tickets
  for each row execute function touch_updated_at();

alter table support_tickets disable row level security;

-- Explicit grants on the newly-created table. dev_grants.sql only granted
-- to tables existing at the time it ran — new tables need their own grant.
grant select, insert, update, delete on support_tickets to anon, authenticated;

-- RPCs for ticket lifecycle
create or replace function raise_ticket(
  rid uuid,
  subject_text text,
  body_text text,
  priority_val ticket_priority default 'normal',
  raised_by_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  new_id uuid;
  org_id uuid;
begin
  if rid is not null then
    select organization_id into org_id from restaurants where id = rid;
  end if;

  insert into support_tickets (restaurant_id, organization_id, raised_by, subject, body, priority)
  values (rid, org_id, raised_by_label, subject_text, body_text, priority_val)
  returning id into new_id;

  return new_id;
end;
$fn$;

grant execute on function raise_ticket(uuid, text, text, ticket_priority, text) to anon, authenticated;

create or replace function update_ticket_status(t_id uuid, new_status ticket_status, resolution_text text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update support_tickets
  set status = new_status,
      resolution = coalesce(resolution_text, resolution)
  where id = t_id;
end;
$fn$;

grant execute on function update_ticket_status(uuid, ticket_status, text) to anon, authenticated;

-- ─── 8. Per-weekday business hours (stored as JSONB array on restaurant.settings) ───
-- Shape: settings.hours_weekly = [
--   { day: 'mon', is_open: true,  open: '09:00', close: '23:00' },
--   { day: 'tue', is_open: true,  open: '09:00', close: '23:00' },
--   { day: 'wed', ... }, ... 7 entries total
-- ]
-- Backfill defaults for any restaurant that doesn't have it yet.
update restaurants
set settings = settings || jsonb_build_object('hours_weekly', jsonb_build_array(
    jsonb_build_object('day', 'mon', 'is_open', true, 'open', '09:00', 'close', '23:00'),
    jsonb_build_object('day', 'tue', 'is_open', true, 'open', '09:00', 'close', '23:00'),
    jsonb_build_object('day', 'wed', 'is_open', true, 'open', '09:00', 'close', '23:00'),
    jsonb_build_object('day', 'thu', 'is_open', true, 'open', '09:00', 'close', '23:00'),
    jsonb_build_object('day', 'fri', 'is_open', true, 'open', '09:00', 'close', '23:00'),
    jsonb_build_object('day', 'sat', 'is_open', true, 'open', '09:00', 'close', '23:30'),
    jsonb_build_object('day', 'sun', 'is_open', true, 'open', '09:00', 'close', '23:30')
  ))
where not (settings ? 'hours_weekly');

-- ════════════════════════════════════════════════════════════════════
-- Quick verify:
-- ════════════════════════════════════════════════════════════════════
-- select id, name, rating, review_count from restaurants;
-- select provider, is_enabled from payment_providers;
-- select restaurant_id, provider, is_active from payment_gateways order by restaurant_id;
-- select * from support_tickets;
-- select id, name, settings->'hours_weekly' from restaurants;
