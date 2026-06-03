-- ════════════════════════════════════════════════════════════════════
-- FoodCourt — full setup SQL
-- ════════════════════════════════════════════════════════════════════
-- Paste this entire file into Supabase → SQL Editor → New query.
-- Safe to run on a fresh project. To redo on an existing one:
--   1) run supabase/reset.sql first (drops public schema)
--   2) then run this file
-- ════════════════════════════════════════════════════════════════════


-- ==== FILE: supabase/migrations/0001_initial_schema.sql ====

-- FoodCourt: initial multi-tenant schema
-- Every business table carries restaurant_id and is isolated via RLS.

create extension if not exists "pgcrypto";

-- ============================================================
-- TENANTS
-- ============================================================
create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  cuisines      text[] default '{}',
  rating        numeric(3,1) default 0,
  review_count  integer default 0,
  prep_time_min integer default 15,
  prep_time_max integer default 25,
  hero_image    text,
  welcome_text  text default 'Your table is ready. Browse the menu and start ordering.',
  is_open       boolean default true,
  -- operational settings (tax, charges, payment mode, etc.) live here
  settings      jsonb not null default jsonb_build_object(
    'gst_percent', 5,
    'gst_inclusive', false,
    'service_charge_percent', 0,
    'packing_charge', 0,
    'payment_mode', 'counter',           -- counter | online | both
    'auto_accept_orders', true,
    'auto_print_kot', true,
    'loyalty_earn_rate', 5,              -- 5 points per 100 spent
    'loyalty_max_redeem_percent', 10
  ),
  created_at    timestamptz not null default now()
);

create index on restaurants (slug);

-- ============================================================
-- TABLES (physical dining tables with QR codes)
-- ============================================================
create table dining_tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label         text not null,         -- "Table 7"
  qr_token      text unique not null,  -- the segment used in /:slug/t/:qr_token
  is_active     boolean default true,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, label)
);

create index on dining_tables (restaurant_id);

-- ============================================================
-- STAFF & ROLES
-- ============================================================
create type staff_role as enum ('owner', 'manager', 'cashier', 'kitchen', 'waiter');

create table restaurant_staff (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          staff_role not null,
  display_name  text,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create index on restaurant_staff (user_id);
create index on restaurant_staff (restaurant_id);

-- ============================================================
-- MENU
-- ============================================================
create table categories (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  name            text not null,
  sort_order      integer not null default 0,
  available_from  time,                  -- null = always available
  available_to    time,
  created_at      timestamptz not null default now()
);

create index on categories (restaurant_id, sort_order);

create type food_type as enum ('veg', 'non_veg', 'egg');

create table menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id   uuid not null references categories(id) on delete restrict,
  name          text not null,
  description   text,
  image_url     text,
  base_price    numeric(10,2) not null,
  food_type     food_type not null default 'veg',
  rating        numeric(3,1) default 0,
  rating_count  integer default 0,
  is_bestseller boolean default false,
  is_recommended boolean default false,
  in_stock      boolean default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index on menu_items (restaurant_id, category_id);
create index on menu_items (restaurant_id) where is_recommended = true;

-- Variants (Half/Full, S/M/L) — required choice
create table menu_variants (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  name          text not null,           -- "Half (6 pcs)"
  price         numeric(10,2) not null,  -- absolute price for this variant
  sort_order    integer not null default 0,
  is_default    boolean default false
);

create index on menu_variants (menu_item_id);

-- Modifiers / Add-ons (optional)
create table menu_modifiers (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  group_name    text not null default 'Add-ons',
  name          text not null,           -- "Extra Mint Chutney"
  price_delta   numeric(10,2) not null default 0,
  is_required   boolean default false,
  sort_order    integer not null default 0
);

create index on menu_modifiers (menu_item_id);

-- ============================================================
-- CUSTOMERS (phone-verified, optional anonymous)
-- ============================================================
create table customers (
  id            uuid primary key default gen_random_uuid(),
  phone         text unique,
  name          text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- ORDERS
-- ============================================================
create type order_type   as enum ('dine_in', 'takeaway');
create type order_status as enum ('received', 'preparing', 'ready', 'completed', 'cancelled');
create type payment_status as enum ('pending', 'success', 'failed', 'refunded', 'counter');

-- Human-friendly order codes (FC-567726)
create sequence order_code_seq start 100000;

create table orders (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  code            text unique not null default ('FC-' || nextval('order_code_seq')::text),
  table_id        uuid references dining_tables(id),
  customer_id     uuid references customers(id),
  type            order_type not null,
  status          order_status not null default 'received',
  -- pricing snapshot
  subtotal        numeric(10,2) not null,
  tax             numeric(10,2) not null default 0,
  service_charge  numeric(10,2) not null default 0,
  packing_charge  numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  coins_redeemed  integer not null default 0,
  coins_value     numeric(10,2) not null default 0,
  total           numeric(10,2) not null,
  -- offers
  coupon_id       uuid,
  -- payment
  payment_status  payment_status not null default 'counter',
  -- notes
  customer_notes  text,
  estimated_min   integer,
  estimated_max   integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on orders (restaurant_id, status, created_at desc);
create index on orders (restaurant_id, created_at desc);
create index on orders (table_id) where status in ('received','preparing','ready');

create table order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  menu_item_id    uuid not null references menu_items(id),
  variant_id      uuid references menu_variants(id),
  item_name       text not null,         -- snapshot
  variant_name    text,                  -- snapshot
  modifiers       jsonb not null default '[]'::jsonb, -- [{name, price_delta}]
  qty             integer not null check (qty > 0),
  unit_price      numeric(10,2) not null,
  line_total      numeric(10,2) not null,
  notes           text
);

create index on order_items (order_id);

-- Status history for the customer-facing timeline
create table order_status_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  status      order_status not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index on order_status_events (order_id, created_at);

-- ============================================================
-- OFFERS
-- ============================================================
create type coupon_type as enum ('percent', 'flat', 'bogo', 'free_item');

create table coupons (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  code            text not null,
  description     text,
  type            coupon_type not null,
  value           numeric(10,2),         -- percent value or flat amount
  min_order_value numeric(10,2) default 0,
  max_discount    numeric(10,2),
  valid_from      timestamptz,
  valid_to        timestamptz,
  usage_limit     integer,               -- null = unlimited
  used_count      integer not null default 0,
  applies_to      text[] default '{dine_in,takeaway}',  -- order types
  -- richer rules go here (happy hour windows, item targeting, etc.)
  conditions      jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (restaurant_id, code)
);

create index on coupons (restaurant_id, is_active);

-- ============================================================
-- LOYALTY (FoodCoins)
-- ============================================================
create table loyalty_wallets (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  balance       integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, customer_id)
);

create type loyalty_txn_type as enum ('earn', 'redeem', 'bonus', 'expire', 'refund');

create table loyalty_transactions (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references loyalty_wallets(id) on delete cascade,
  order_id    uuid references orders(id),
  type        loyalty_txn_type not null,
  points      integer not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index on loyalty_transactions (wallet_id, created_at desc);

-- ============================================================
-- KOT (Kitchen Order Tickets)
-- ============================================================
create type kot_status as enum ('new', 'cooking', 'ready', 'complete');

create table kot_tickets (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  ticket_no       text not null,         -- "KOT-8412"
  station         text default 'all',    -- grill | curry | tandoor | all
  status          kot_status not null default 'new',
  is_rush         boolean default false,
  payload         jsonb not null,        -- snapshot of items for printing
  items_done      integer not null default 0,
  items_total     integer not null default 0,
  printed_at      timestamptz,
  reprint_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on kot_tickets (restaurant_id, status, created_at);
create index on kot_tickets (order_id);

-- per-item done state within a KOT
create table kot_ticket_items (
  id              uuid primary key default gen_random_uuid(),
  kot_ticket_id   uuid not null references kot_tickets(id) on delete cascade,
  order_item_id   uuid not null references order_items(id) on delete cascade,
  is_done         boolean not null default false,
  sort_order      integer not null default 0
);

create index on kot_ticket_items (kot_ticket_id);

-- ============================================================
-- AUDIT
-- ============================================================
create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  actor_id      uuid,
  action        text not null,
  entity        text,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  created_at    timestamptz not null default now()
);

create index on audit_log (restaurant_id, created_at desc);

-- ============================================================
-- TRIGGERS
-- ============================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();
create trigger kot_touch before update on kot_tickets
  for each row execute function touch_updated_at();

-- record status changes
create or replace function record_order_status_change()
returns trigger language plpgsql as $$
begin
  if (TG_OP = 'INSERT') or (new.status is distinct from old.status) then
    insert into order_status_events (order_id, status) values (new.id, new.status);
  end if;
  return new;
end $$;

create trigger orders_status_event after insert or update of status on orders
  for each row execute function record_order_status_change();

-- ==== FILE: supabase/migrations/0002_rls_policies.sql ====

-- Row Level Security: tenant isolation.
-- Every table is locked down; staff access is gated by restaurant_staff membership.
-- Customer access flows through the public menu views (open) and Edge Functions
-- (signed actions like placing orders). Anonymous public reads are scoped to
-- exactly the data needed to render the menu.

-- ============================================================
-- HELPER: is the current user staff of a given restaurant?
-- ============================================================
create or replace function is_staff_of(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from restaurant_staff
    where user_id = auth.uid() and restaurant_id = rid
  );
$$;

create or replace function staff_role_for(rid uuid)
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role from restaurant_staff
  where user_id = auth.uid() and restaurant_id = rid
  limit 1;
$$;

-- ============================================================
-- Enable RLS on everything
-- ============================================================
alter table restaurants            enable row level security;
alter table dining_tables          enable row level security;
alter table restaurant_staff       enable row level security;
alter table categories             enable row level security;
alter table menu_items             enable row level security;
alter table menu_variants          enable row level security;
alter table menu_modifiers         enable row level security;
alter table customers              enable row level security;
alter table orders                 enable row level security;
alter table order_items            enable row level security;
alter table order_status_events    enable row level security;
alter table coupons                enable row level security;
alter table loyalty_wallets        enable row level security;
alter table loyalty_transactions   enable row level security;
alter table kot_tickets            enable row level security;
alter table kot_ticket_items       enable row level security;
alter table audit_log              enable row level security;

-- ============================================================
-- RESTAURANTS: public can read basic profile by slug (for landing page).
-- Staff can update only their own restaurant.
-- ============================================================
create policy restaurants_public_read on restaurants
  for select using (true);

create policy restaurants_staff_update on restaurants
  for update using (is_staff_of(id))
  with check (is_staff_of(id));

-- ============================================================
-- DINING TABLES: public can read by qr_token; staff full access.
-- ============================================================
create policy dining_tables_public_read on dining_tables
  for select using (is_active = true);

create policy dining_tables_staff_all on dining_tables
  for all using (is_staff_of(restaurant_id))
  with check (is_staff_of(restaurant_id));

-- ============================================================
-- MENU (categories, items, variants, modifiers): public read; staff write
-- ============================================================
create policy categories_public_read on categories for select using (true);
create policy categories_staff_all   on categories for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

create policy menu_items_public_read on menu_items for select using (true);
create policy menu_items_staff_all   on menu_items for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

create policy menu_variants_public_read on menu_variants
  for select using (
    exists (select 1 from menu_items mi where mi.id = menu_item_id)
  );
create policy menu_variants_staff_all on menu_variants for all
  using (exists (select 1 from menu_items mi
                 where mi.id = menu_item_id and is_staff_of(mi.restaurant_id)))
  with check (exists (select 1 from menu_items mi
                      where mi.id = menu_item_id and is_staff_of(mi.restaurant_id)));

create policy menu_modifiers_public_read on menu_modifiers
  for select using (
    exists (select 1 from menu_items mi where mi.id = menu_item_id)
  );
create policy menu_modifiers_staff_all on menu_modifiers for all
  using (exists (select 1 from menu_items mi
                 where mi.id = menu_item_id and is_staff_of(mi.restaurant_id)))
  with check (exists (select 1 from menu_items mi
                      where mi.id = menu_item_id and is_staff_of(mi.restaurant_id)));

-- ============================================================
-- COUPONS: only active ones visible publicly; staff full access.
-- ============================================================
create policy coupons_public_read on coupons
  for select using (
    is_active = true
    and (valid_from is null or valid_from <= now())
    and (valid_to   is null or valid_to   >= now())
  );

create policy coupons_staff_all on coupons for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

-- ============================================================
-- CUSTOMERS: self-access by id (when authed)
-- ============================================================
create policy customers_self_read on customers
  for select using (id::text = (auth.jwt() ->> 'customer_id'));

-- ============================================================
-- ORDERS: staff full access; customers can read their own order
--   via short-lived access token passed through Edge Function (handled
--   in the API layer, not RLS). For now, no anonymous SELECT.
-- ============================================================
create policy orders_staff_all on orders for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

create policy order_items_staff_all on order_items for all
  using (exists (select 1 from orders o
                 where o.id = order_id and is_staff_of(o.restaurant_id)))
  with check (exists (select 1 from orders o
                      where o.id = order_id and is_staff_of(o.restaurant_id)));

create policy order_status_events_staff_read on order_status_events for select
  using (exists (select 1 from orders o
                 where o.id = order_id and is_staff_of(o.restaurant_id)));

-- ============================================================
-- LOYALTY: staff full access; customer self-read
-- ============================================================
create policy wallets_staff_all on loyalty_wallets for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

create policy wallets_self_read on loyalty_wallets for select
  using (customer_id::text = (auth.jwt() ->> 'customer_id'));

create policy txns_staff_all on loyalty_transactions for all
  using (exists (select 1 from loyalty_wallets w
                 where w.id = wallet_id and is_staff_of(w.restaurant_id)))
  with check (exists (select 1 from loyalty_wallets w
                      where w.id = wallet_id and is_staff_of(w.restaurant_id)));

-- ============================================================
-- KOT: staff/kitchen only
-- ============================================================
create policy kot_staff_all on kot_tickets for all
  using (is_staff_of(restaurant_id)) with check (is_staff_of(restaurant_id));

create policy kot_items_staff_all on kot_ticket_items for all
  using (exists (select 1 from kot_tickets k
                 where k.id = kot_ticket_id and is_staff_of(k.restaurant_id)))
  with check (exists (select 1 from kot_tickets k
                      where k.id = kot_ticket_id and is_staff_of(k.restaurant_id)));

-- ============================================================
-- STAFF: a user can read their own membership rows; managers/owners can manage.
-- ============================================================
create policy staff_self_read on restaurant_staff
  for select using (user_id = auth.uid());

create policy staff_manage_by_owner on restaurant_staff for all
  using (
    exists (
      select 1 from restaurant_staff s
      where s.restaurant_id = restaurant_staff.restaurant_id
        and s.user_id = auth.uid()
        and s.role in ('owner','manager')
    )
  )
  with check (
    exists (
      select 1 from restaurant_staff s
      where s.restaurant_id = restaurant_staff.restaurant_id
        and s.user_id = auth.uid()
        and s.role in ('owner','manager')
    )
  );

-- ============================================================
-- AUDIT LOG: staff read-only
-- ============================================================
create policy audit_staff_read on audit_log for select
  using (is_staff_of(restaurant_id));

-- ==== FILE: supabase/migrations/0003_seed.sql ====

-- Seed data: two demo restaurants matching the UI mockups.
-- Run after 0001 + 0002. Idempotent on slug.

do $$
declare
  r_spice_route uuid;
  r_spice_garden uuid;
  t7 uuid;
  cat_starters uuid;
  cat_mains uuid;
  cat_breads uuid;
  cat_biryani uuid;
  cat_desserts uuid;
  cat_bev uuid;
  paneer_tikka uuid;
begin
  -- The Spice Route (customer-facing demo)
  insert into restaurants (slug, name, cuisines, rating, review_count, prep_time_min, prep_time_max, hero_image, welcome_text)
  values (
    'the-spice-route',
    'The Spice Route',
    array['North Indian','Mughlai','Biryani'],
    4.7, 2100, 15, 25,
    'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1200',
    'Your table is ready. Browse the menu and start ordering. We''ll bring it right to you!'
  )
  on conflict (slug) do update set name = excluded.name
  returning id into r_spice_route;

  -- Spice Garden (admin-facing demo)
  insert into restaurants (slug, name, cuisines, rating, review_count)
  values ('spice-garden','Spice Garden', array['North Indian','Continental'], 4.6, 1450)
  on conflict (slug) do update set name = excluded.name
  returning id into r_spice_garden;

  -- ---------- dining tables ----------
  insert into dining_tables (restaurant_id, label, qr_token)
  values
    (r_spice_route, 'Table 1', 'sr-t1'),
    (r_spice_route, 'Table 7', 'sr-t7'),
    (r_spice_route, 'Table 12', 'sr-t12')
  on conflict do nothing;

  select id into t7 from dining_tables where restaurant_id = r_spice_route and label = 'Table 7';

  -- ---------- categories ----------
  insert into categories (restaurant_id, name, sort_order) values
    (r_spice_route, 'Starters',     1),
    (r_spice_route, 'Main Course',  2),
    (r_spice_route, 'Breads',       3),
    (r_spice_route, 'Biryani',      4),
    (r_spice_route, 'Desserts',     5),
    (r_spice_route, 'Beverages',    6),
    (r_spice_route, 'Combos',       7)
  on conflict do nothing;

  select id into cat_starters from categories where restaurant_id = r_spice_route and name = 'Starters';
  select id into cat_mains    from categories where restaurant_id = r_spice_route and name = 'Main Course';
  select id into cat_breads   from categories where restaurant_id = r_spice_route and name = 'Breads';
  select id into cat_biryani  from categories where restaurant_id = r_spice_route and name = 'Biryani';
  select id into cat_desserts from categories where restaurant_id = r_spice_route and name = 'Desserts';
  select id into cat_bev      from categories where restaurant_id = r_spice_route and name = 'Beverages';

  -- ---------- menu items ----------
  insert into menu_items (restaurant_id, category_id, name, description, image_url, base_price, food_type, rating, rating_count, is_bestseller, is_recommended)
  values
    (r_spice_route, cat_starters, 'Paneer Tikka',  'Smoky cottage cheese cubes marinated in spiced yogurt, grilled in tandoor', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600', 280, 'veg', 4.7, 234, true, true),
    (r_spice_route, cat_starters, 'Chicken 65',    'Spicy deep-fried chicken with curry leaves and green chilli',              'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600', 320, 'non_veg', 4.8, 198, false, true),
    (r_spice_route, cat_mains,    'Dal Makhani',   'Slow-cooked black lentils with butter and cream',                          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600', 260, 'veg', 4.8, 412, true, true),
    (r_spice_route, cat_mains,    'Butter Chicken','Tandoori chicken in rich tomato-butter gravy',                             'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600', 340, 'non_veg', 4.9, 521, true, true),
    (r_spice_route, cat_breads,   'Garlic Naan',   'Soft naan brushed with garlic butter',                                     'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=600', 80,  'veg', 4.6, 180, false, false),
    (r_spice_route, cat_breads,   'Butter Naan',   'Classic tandoori naan with butter',                                        'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=600', 70,  'veg', 4.5, 220, false, false),
    (r_spice_route, cat_biryani,  'Chicken Dum Biryani', 'Aromatic basmati rice cooked with chicken on slow dum',              'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600', 380, 'non_veg', 4.8, 612, true, false),
    (r_spice_route, cat_biryani,  'Veg Dum Biryani',     'Fragrant basmati with seasonal vegetables and spices',               'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=600', 280, 'veg', 4.4, 178, false, false),
    (r_spice_route, cat_desserts, 'Gulab Jamun',   'Soft milk dumplings in rose-cardamom syrup',                               'https://images.unsplash.com/photo-1601303516534-4dc16d2b6f49?w=600', 120, 'veg', 4.7, 290, false, false),
    (r_spice_route, cat_bev,      'Masala Chai',   'Traditional spiced milk tea',                                              'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=600', 60,  'veg', 4.6, 150, false, false)
  on conflict do nothing;

  select id into paneer_tikka from menu_items
    where restaurant_id = r_spice_route and name = 'Paneer Tikka';

  -- ---------- variants for Paneer Tikka (Half / Full) ----------
  insert into menu_variants (menu_item_id, name, price, sort_order, is_default) values
    (paneer_tikka, 'Half (6 pcs)',  280, 1, true),
    (paneer_tikka, 'Full (12 pcs)', 480, 2, false)
  on conflict do nothing;

  -- ---------- modifiers for Paneer Tikka ----------
  insert into menu_modifiers (menu_item_id, group_name, name, price_delta, is_required, sort_order) values
    (paneer_tikka, 'Add-ons', 'Extra Mint Chutney', 20, false, 1),
    (paneer_tikka, 'Add-ons', 'Extra Onion Salad',  15, false, 2),
    (paneer_tikka, 'Add-ons', 'Cheese Topping',     40, false, 3)
  on conflict do nothing;

  -- ---------- coupons ----------
  insert into coupons (restaurant_id, code, description, type, value, min_order_value, max_discount, is_active, conditions) values
    (r_spice_route, 'SPICE20', 'Use code SPICE20 for 20% off', 'percent', 20, 200, 100, true, '{"featured":true,"banner":true}'::jsonb),
    (r_spice_route, 'FIRST50', 'Flat ₹50 off on your first order', 'flat', 50, 200, null, true, '{"first_order_only":true}'::jsonb),
    (r_spice_route, 'SAVE10',  '10% off site-wide',              'percent', 10, 0, 80, true, '{}'::jsonb),
    (r_spice_route, 'HAPPY20', '20% off beverages, 4-6 PM',      'percent', 20, 0, null, true,
     '{"happy_hour":{"from":"16:00","to":"18:00"},"categories":["Beverages"]}'::jsonb)
  on conflict do nothing;

end $$;

-- ==== FILE: supabase/migrations/0004_branches_payments_reservations.sql ====

-- Phase B: parent organizations, branches, payment gateways, detailed payments,
-- reservations, dining areas, platform admins, role permissions, customer
-- profile extensions, POS sessions, invoice numbering, branch branding.
--
-- We keep the existing `restaurants` table as the *branch* unit and add
-- `organizations` on top. A restaurant row's `organization_id` ties it to a
-- parent brand that may have multiple branches.

create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANIZATIONS (parent tenant — owns 1..N branches/restaurants)
-- ============================================================
create table organizations (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null,
  logo_url            text,
  brand_color         text default '#EA580C',
  accent_color        text default '#16A34A',
  contact_email       text,
  contact_phone       text,
  gst_no              text,
  fssai_no            text,
  -- platform admin / subscription fields
  plan                text default 'starter',            -- starter | growth | enterprise
  commission_percent  numeric(5,2) default 2.5,
  is_active           boolean default true,
  trial_ends_at       timestamptz,
  created_at          timestamptz default now()
);

create index on organizations (is_active);

-- Existing `restaurants` becomes a branch under an organization.
alter table restaurants
  add column organization_id uuid references organizations(id) on delete cascade,
  add column branch_code     text,
  add column address         text,
  add column area_name       text,
  add column city            text default 'Bengaluru',
  add column phone           text,
  add column logo_url        text,
  add column theme           jsonb default jsonb_build_object('primary','#EA580C','accent','#16A34A');

create index on restaurants (organization_id);

-- ============================================================
-- PLATFORM ADMINS (super admin / support / finance)
-- ============================================================
create table platform_admins (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'super_admin' check (role in ('super_admin','support','finance')),
  display_name text,
  created_at   timestamptz default now()
);

create or replace function is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- ============================================================
-- PAYMENT GATEWAYS (per branch credentials)
-- secret values are NEVER stored plain; `*_ref` columns point at Supabase
-- Vault entries — actual read happens server-side only.
-- ============================================================
create type payment_provider as enum ('razorpay','stripe','phonepe','paytm','cashfree');

create table payment_gateways (
  id                   uuid primary key default gen_random_uuid(),
  restaurant_id        uuid not null references restaurants(id) on delete cascade,
  provider             payment_provider not null,
  key_id               text not null,
  secret_ref           text,
  webhook_secret_ref   text,
  is_active            boolean default false,
  is_primary           boolean default false,
  test_mode            boolean default true,
  last_verified_at     timestamptz,
  created_at           timestamptz default now(),
  unique (restaurant_id, provider)
);

create index on payment_gateways (restaurant_id);
-- enforce only one primary per branch
create unique index on payment_gateways (restaurant_id) where is_primary = true;

-- ============================================================
-- DETAILED PAYMENTS (one row per attempt; orders.payment_status is summary)
-- ============================================================
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants(id) on delete cascade,
  order_id            uuid not null references orders(id) on delete cascade,
  gateway_id          uuid references payment_gateways(id),
  provider            payment_provider,
  gateway_payment_id  text,
  gateway_order_id    text,
  amount              numeric(10,2) not null,
  currency            text default 'INR',
  method              text,                    -- upi | card | wallet | netbanking | cash
  status              payment_status not null default 'pending',
  failure_code        text,
  failure_reason      text,
  raw_webhook         jsonb,
  attempt_no          int default 1,
  refunded_amount     numeric(10,2) default 0,
  refund_id           text,
  refund_reason       text,
  created_at          timestamptz default now(),
  completed_at        timestamptz
);

create index on payments (restaurant_id, created_at desc);
create index on payments (order_id);
create unique index on payments (gateway_payment_id) where gateway_payment_id is not null;

-- ============================================================
-- RESERVATIONS
-- ============================================================
create type reservation_status as enum
  ('pending','confirmed','seated','completed','cancelled','no_show');

create table reservations (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  table_id        uuid references dining_tables(id),
  customer_name   text not null,
  customer_phone  text,
  customer_email  text,
  party_size      int not null check (party_size > 0),
  reserved_at     timestamptz not null,
  duration_min    int default 90,
  status          reservation_status not null default 'confirmed',
  notes           text,
  source          text default 'phone',         -- phone | website | walk_in
  created_by      uuid,
  created_at      timestamptz default now()
);

create index on reservations (restaurant_id, reserved_at);
create index on reservations (restaurant_id, status) where status in ('pending','confirmed','seated');

-- ============================================================
-- AREAS / ZONES (group tables for floor plan management)
-- ============================================================
create table dining_areas (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name          text not null,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

create index on dining_areas (restaurant_id, sort_order);

alter table dining_tables add column area_id uuid references dining_areas(id);

-- ============================================================
-- ROLE PERMISSIONS (granular flags per role)
-- ============================================================
create table role_permissions (
  role        staff_role primary key,
  permissions text[] not null default '{}'
);

insert into role_permissions (role, permissions) values
  ('owner',   array['*']),
  ('manager', array['orders:*','menu:*','offers:*','staff:read','staff:write','tables:*','reservations:*','customers:*','settings:read','settings:write','reports:read']),
  ('cashier', array['orders:read','orders:update_status','payments:*','reservations:read','reports:read']),
  ('kitchen', array['orders:read','orders:update_status','kds:*']),
  ('waiter',  array['orders:read','orders:create','orders:update_status','tables:read','reservations:read'])
on conflict (role) do nothing;

-- ============================================================
-- CUSTOMER PROFILE EXTENSIONS
-- ============================================================
alter table customers
  add column email          text,
  add column avatar_url     text,
  add column total_orders   int default 0,
  add column total_spent    numeric(10,2) default 0,
  add column last_order_at  timestamptz,
  add column tags           text[] default '{}';

create table customer_preferences (
  customer_id      uuid primary key references customers(id) on delete cascade,
  food_type_pref   food_type,
  allergens        text[] default '{}',
  spice_pref       text,
  marketing_opt_in boolean default true
);

create table customer_feedback (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id      uuid references orders(id),
  customer_id   uuid references customers(id),
  rating        int check (rating between 1 and 5),
  comment       text,
  is_published  boolean default false,
  created_at    timestamptz default now()
);

create index on customer_feedback (restaurant_id, created_at desc);

-- ============================================================
-- POS / CASH SESSIONS
-- ============================================================
create table pos_sessions (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  cashier_id      uuid references auth.users(id),
  opened_at       timestamptz default now(),
  closed_at       timestamptz,
  opening_float   numeric(10,2),
  expected_cash   numeric(10,2),
  actual_cash     numeric(10,2),
  variance        numeric(10,2),
  notes           text
);

create index on pos_sessions (restaurant_id, opened_at desc);

-- ============================================================
-- INVOICE NUMBERING
-- ============================================================
alter table orders add column invoice_no text;
create unique index orders_invoice_no_per_restaurant
  on orders (restaurant_id, invoice_no) where invoice_no is not null;

-- ==== FILE: supabase/migrations/0005_rls_phase2.sql ====

-- RLS for Phase B tables. Three layers of access:
--   1. branch staff   (existing is_staff_of)
--   2. org staff      (any branch of the same org)
--   3. platform admin (super admin — sees everything)

-- ============================================================
-- HELPERS
-- ============================================================
create or replace function is_staff_of_org(oid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from restaurant_staff s
    join restaurants r on r.id = s.restaurant_id
    where s.user_id = auth.uid() and r.organization_id = oid
  );
$$;

create or replace function is_org_owner(oid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from restaurant_staff s
    join restaurants r on r.id = s.restaurant_id
    where s.user_id = auth.uid()
      and r.organization_id = oid
      and s.role = 'owner'
  );
$$;

-- ============================================================
-- Enable RLS
-- ============================================================
alter table organizations         enable row level security;
alter table platform_admins       enable row level security;
alter table payment_gateways      enable row level security;
alter table payments              enable row level security;
alter table reservations          enable row level security;
alter table dining_areas          enable row level security;
alter table role_permissions      enable row level security;
alter table customer_preferences  enable row level security;
alter table customer_feedback     enable row level security;
alter table pos_sessions          enable row level security;

-- ============================================================
-- ORGANIZATIONS
-- Staff of any branch of the org can read; owners can update; super_admin full.
-- ============================================================
create policy orgs_member_read on organizations
  for select using (is_staff_of_org(id) or is_platform_admin());

create policy orgs_owner_update on organizations
  for update using (is_org_owner(id)) with check (is_org_owner(id));

create policy orgs_super_all on organizations
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ============================================================
-- PLATFORM ADMINS — only super admins manage themselves
-- ============================================================
create policy padmins_super_all on platform_admins
  for all using (is_platform_admin()) with check (is_platform_admin());

-- A user can always see whether they themselves are a platform admin
create policy padmins_self_read on platform_admins
  for select using (user_id = auth.uid());

-- ============================================================
-- PAYMENT GATEWAYS
-- Branch staff manage their own credentials; super admin sees all.
-- ============================================================
create policy gateways_branch_staff on payment_gateways for all
  using (is_staff_of(restaurant_id) or is_platform_admin())
  with check (is_staff_of(restaurant_id) or is_platform_admin());

-- ============================================================
-- PAYMENTS
-- Branch staff full; super admin read.
-- Customers can self-read via the order short-link (handled in edge function).
-- ============================================================
create policy payments_branch_staff on payments for all
  using (is_staff_of(restaurant_id) or is_platform_admin())
  with check (is_staff_of(restaurant_id) or is_platform_admin());

-- ============================================================
-- RESERVATIONS
-- Branch staff manage; public read disabled (PII).
-- Inserts from customer side flow through an Edge Function.
-- ============================================================
create policy reservations_branch_staff on reservations for all
  using (is_staff_of(restaurant_id) or is_platform_admin())
  with check (is_staff_of(restaurant_id) or is_platform_admin());

-- ============================================================
-- DINING AREAS (public read so the customer menu can show area names)
-- ============================================================
create policy areas_public_read on dining_areas for select using (true);
create policy areas_staff_write on dining_areas for all
  using (is_staff_of(restaurant_id) or is_platform_admin())
  with check (is_staff_of(restaurant_id) or is_platform_admin());

-- ============================================================
-- ROLE PERMISSIONS
-- ============================================================
create policy role_perms_read on role_permissions for select using (auth.uid() is not null);
create policy role_perms_super_write on role_permissions for all
  using (is_platform_admin()) with check (is_platform_admin());

-- ============================================================
-- CUSTOMER PREFERENCES — customer self-access via JWT claim
-- ============================================================
create policy custprefs_self on customer_preferences for select
  using (customer_id::text = (auth.jwt() ->> 'customer_id'));

create policy custprefs_self_write on customer_preferences for insert
  with check (customer_id::text = (auth.jwt() ->> 'customer_id'));

create policy custprefs_self_update on customer_preferences for update
  using (customer_id::text = (auth.jwt() ->> 'customer_id'))
  with check (customer_id::text = (auth.jwt() ->> 'customer_id'));

-- ============================================================
-- CUSTOMER FEEDBACK
-- ============================================================
create policy feedback_staff_read on customer_feedback for select
  using (is_staff_of(restaurant_id) or is_platform_admin());

create policy feedback_customer_create on customer_feedback for insert
  with check (customer_id::text = (auth.jwt() ->> 'customer_id'));

-- ============================================================
-- POS SESSIONS
-- ============================================================
create policy pos_branch_staff on pos_sessions for all
  using (is_staff_of(restaurant_id) or is_platform_admin())
  with check (is_staff_of(restaurant_id) or is_platform_admin());

-- ============================================================
-- Allow super admin to bypass earlier RLS on existing tables
-- ============================================================
create policy restaurants_super_all on restaurants
  for all using (is_platform_admin()) with check (is_platform_admin());

create policy orders_super_all on orders
  for all using (is_platform_admin()) with check (is_platform_admin());

create policy menu_items_super_all on menu_items
  for all using (is_platform_admin()) with check (is_platform_admin());

create policy coupons_super_all on coupons
  for all using (is_platform_admin()) with check (is_platform_admin());

create policy staff_super_all on restaurant_staff
  for all using (is_platform_admin()) with check (is_platform_admin());

create policy kot_super_all on kot_tickets
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ==== FILE: supabase/migrations/0006_seed_phase2.sql ====

-- Seed organizations, link existing restaurants as branches, add more demo
-- branches, dining areas, payment gateway entries. Idempotent on slug.

do $$
declare
  o_spice  uuid;
  o_route  uuid;
  r_sr     uuid;
  r_sg     uuid;
  r_sg_kor uuid;
  r_sg_ind uuid;
  a_main   uuid;
  a_patio  uuid;
  a_pdr    uuid;
begin
  -- ---- organizations ----
  insert into organizations (slug, name, brand_color, contact_phone, gst_no, fssai_no, plan, commission_percent)
  values
    ('spice-garden-hospitality', 'Spice Garden Hospitality',
      '#EA580C', '+91 98201 14523', '29ABCDE1234F1Z5', '10024056001234', 'growth', 2.5)
  on conflict (slug) do update set name = excluded.name
  returning id into o_spice;

  insert into organizations (slug, name, brand_color, contact_phone, plan, commission_percent)
  values ('the-spice-route-co', 'The Spice Route Co', '#b7122a', '+91 98765 12245', 'starter', 3.0)
  on conflict (slug) do update set name = excluded.name
  returning id into o_route;

  -- ---- link existing restaurants as branches ----
  select id into r_sr from restaurants where slug = 'the-spice-route';
  select id into r_sg from restaurants where slug = 'spice-garden';

  update restaurants set
    organization_id = o_route,
    branch_code = 'SR-WTF',
    area_name = 'Whitefield',
    city = 'Bengaluru',
    phone = '+91 80 4900 1100',
    address = '24, Whitefield Main Road, Bengaluru 560066'
  where id = r_sr;

  update restaurants set
    organization_id = o_spice,
    branch_code = 'SG-MG',
    area_name = 'MG Road',
    city = 'Bengaluru',
    phone = '+91 80 4900 1200',
    address = '221, MG Road, Bengaluru 560001'
  where id = r_sg;

  -- ---- additional Spice Garden branches ----
  insert into restaurants (
    organization_id, slug, name, branch_code, area_name, city, phone, address,
    cuisines, rating, review_count, prep_time_min, prep_time_max,
    hero_image, welcome_text
  ) values (
    o_spice, 'spice-garden-koramangala', 'Spice Garden — Koramangala', 'SG-KOR',
    'Koramangala', 'Bengaluru', '+91 80 4900 1300',
    'Block 5, 80 Feet Road, Koramangala, Bengaluru 560034',
    array['North Indian','Continental'], 4.6, 980, 12, 20,
    null, 'Browse our Koramangala menu.'
  )
  on conflict (slug) do update set organization_id = excluded.organization_id
  returning id into r_sg_kor;

  insert into restaurants (
    organization_id, slug, name, branch_code, area_name, city, phone, address,
    cuisines, rating, review_count, prep_time_min, prep_time_max,
    hero_image, welcome_text
  ) values (
    o_spice, 'spice-garden-indiranagar', 'Spice Garden — Indiranagar', 'SG-IND',
    'Indiranagar', 'Bengaluru', '+91 80 4900 1400',
    '100 Feet Road, Indiranagar, Bengaluru 560038',
    array['North Indian','Continental'], 4.5, 720, 12, 20,
    null, 'Browse our Indiranagar menu.'
  )
  on conflict (slug) do update set organization_id = excluded.organization_id
  returning id into r_sg_ind;

  -- ---- dining areas for The Spice Route ----
  insert into dining_areas (restaurant_id, name, sort_order)
  values (r_sr, 'Main Hall', 1)
  on conflict do nothing
  returning id into a_main;

  insert into dining_areas (restaurant_id, name, sort_order)
  values (r_sr, 'Patio', 2)
  on conflict do nothing
  returning id into a_patio;

  insert into dining_areas (restaurant_id, name, sort_order)
  values (r_sr, 'Private Dining', 3)
  on conflict do nothing
  returning id into a_pdr;

  -- attach existing tables to areas (first 4 to main, 5-7 to patio, rest to PDR)
  update dining_tables set area_id = a_main  where restaurant_id = r_sr and label in ('Table 1','Table 2','Table 3');
  update dining_tables set area_id = a_patio where restaurant_id = r_sr and label = 'Table 7';
  update dining_tables set area_id = a_pdr   where restaurant_id = r_sr and label = 'Table 12';

  -- ---- payment gateways (test mode) ----
  insert into payment_gateways (restaurant_id, provider, key_id, secret_ref, is_active, is_primary, test_mode)
  values
    (r_sr, 'razorpay', 'rzp_test_kx2tEXAMPLE', 'vault:rzp_secret_sr', true, true, true)
  on conflict (restaurant_id, provider) do nothing;

  insert into payment_gateways (restaurant_id, provider, key_id, secret_ref, is_active, is_primary, test_mode)
  values
    (r_sg, 'razorpay', 'rzp_live_kx2tEXAMPLE', 'vault:rzp_secret_sg', true, true, false),
    (r_sg, 'stripe',   'pk_live_stripeEXAMPLE', 'vault:stripe_secret_sg', false, false, false),
    (r_sg, 'phonepe',  'PP-MERCHANT-12345',     'vault:phonepe_secret_sg', false, false, false)
  on conflict (restaurant_id, provider) do nothing;

end $$;

-- ==== FILE: supabase/migrations/0007_customer_addresses_push.sql ====

-- Customer-side completeness: saved addresses, push notification tokens,
-- per-customer notification preferences.

-- ============================================================
-- ADDRESSES
-- ============================================================
create table customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  label         text not null default 'Home',     -- Home | Work | Other
  recipient     text,
  phone         text,
  address_line  text not null,
  locality      text,
  city          text,
  state         text,
  pincode       text,
  landmark      text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  is_default    boolean default false,
  created_at    timestamptz default now()
);

create index on customer_addresses (customer_id);
create unique index on customer_addresses (customer_id) where is_default = true;

-- ============================================================
-- PUSH NOTIFICATION TOKENS
-- ============================================================
create table customer_push_tokens (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  token         text not null unique,
  platform      text not null check (platform in ('web','ios','android')),
  device_label  text,
  created_at    timestamptz default now(),
  last_used_at  timestamptz
);

create index on customer_push_tokens (customer_id);

-- ============================================================
-- NOTIFICATION PREFERENCES (extends existing customer_preferences)
-- ============================================================
alter table customer_preferences
  add column notify_order_updates boolean default true,
  add column notify_promotions    boolean default false,
  add column notify_loyalty       boolean default true;

-- ============================================================
-- RLS — customers see only their own rows; staff can read for service
-- ============================================================
alter table customer_addresses    enable row level security;
alter table customer_push_tokens  enable row level security;

create policy addresses_self on customer_addresses for all
  using (customer_id::text = (auth.jwt() ->> 'customer_id'))
  with check (customer_id::text = (auth.jwt() ->> 'customer_id'));

create policy push_self on customer_push_tokens for all
  using (customer_id::text = (auth.jwt() ->> 'customer_id'))
  with check (customer_id::text = (auth.jwt() ->> 'customer_id'));

-- Staff of an order's restaurant can resolve customer address while processing
-- (kept narrow; service-role queries handle most reads).
create policy addresses_staff_for_order on customer_addresses for select
  using (
    exists (
      select 1 from orders o
      where o.customer_id = customer_addresses.customer_id
        and is_staff_of(o.restaurant_id)
    )
  );

-- ==== FILE: supabase/_seed_extras.sql ====

-- ════════════════════════════════════════════════════════════════════
-- Extended demo seed — runs AFTER all migrations.
-- Populates dining tables, menus, variants/modifiers, and coupons for
-- every demo branch so each branch URL has a working QR menu.
-- Idempotent — re-running is safe.
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- Helper: seed a small menu into any restaurant (idempotent)
-- ────────────────────────────────────────────────────────────
create or replace function _seed_branch_menu(rid uuid)
returns void
language plpgsql
as $fn$
declare
  c_starters uuid;
  c_mains    uuid;
  c_breads   uuid;
  c_biryani  uuid;
  c_desserts uuid;
  c_bev      uuid;
  m_paneer   uuid;
begin
  -- Categories (idempotent on name + restaurant)
  insert into categories (restaurant_id, name, sort_order)
  select rid, 'Starters', 1
  where not exists (select 1 from categories where restaurant_id = rid and name = 'Starters');

  insert into categories (restaurant_id, name, sort_order)
  select rid, 'Main Course', 2
  where not exists (select 1 from categories where restaurant_id = rid and name = 'Main Course');

  insert into categories (restaurant_id, name, sort_order)
  select rid, 'Breads', 3
  where not exists (select 1 from categories where restaurant_id = rid and name = 'Breads');

  insert into categories (restaurant_id, name, sort_order)
  select rid, 'Biryani', 4
  where not exists (select 1 from categories where restaurant_id = rid and name = 'Biryani');

  insert into categories (restaurant_id, name, sort_order)
  select rid, 'Desserts', 5
  where not exists (select 1 from categories where restaurant_id = rid and name = 'Desserts');

  insert into categories (restaurant_id, name, sort_order)
  select rid, 'Beverages', 6
  where not exists (select 1 from categories where restaurant_id = rid and name = 'Beverages');

  select id into c_starters from categories where restaurant_id = rid and name = 'Starters';
  select id into c_mains    from categories where restaurant_id = rid and name = 'Main Course';
  select id into c_breads   from categories where restaurant_id = rid and name = 'Breads';
  select id into c_biryani  from categories where restaurant_id = rid and name = 'Biryani';
  select id into c_desserts from categories where restaurant_id = rid and name = 'Desserts';
  select id into c_bev      from categories where restaurant_id = rid and name = 'Beverages';

  -- Menu items (idempotent on name + restaurant)
  perform _ensure_item(rid, c_starters, 'Paneer Tikka',        'Smoky cottage cheese cubes marinated in spiced yogurt, grilled in tandoor',  'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=900',  280, 'veg',     4.7, 234, true,  true);
  perform _ensure_item(rid, c_starters, 'Chicken 65',          'Spicy deep-fried chicken with curry leaves and green chilli',                'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=900',  320, 'non_veg', 4.8, 198, false, true);
  perform _ensure_item(rid, c_mains,    'Dal Makhani',         'Slow-cooked black lentils with butter and cream',                            'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=900',  260, 'veg',     4.8, 412, true,  true);
  perform _ensure_item(rid, c_mains,    'Butter Chicken',      'Tandoori chicken in rich tomato-butter gravy',                               'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=900',  340, 'non_veg', 4.9, 521, true,  true);
  perform _ensure_item(rid, c_breads,   'Garlic Naan',         'Soft naan brushed with garlic butter',                                       'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=900',   80, 'veg',     4.6, 180, false, false);
  perform _ensure_item(rid, c_breads,   'Butter Naan',         'Classic tandoori naan with butter',                                          'https://images.unsplash.com/photo-1574894709920-11b28e7367e3?w=900',   70, 'veg',     4.5, 220, false, false);
  perform _ensure_item(rid, c_biryani,  'Chicken Dum Biryani', 'Aromatic basmati rice cooked with chicken on slow dum',                      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=900',  380, 'non_veg', 4.8, 612, true,  false);
  perform _ensure_item(rid, c_biryani,  'Veg Dum Biryani',     'Fragrant basmati with seasonal vegetables and spices',                       'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=900',  280, 'veg',     4.4, 178, false, false);
  perform _ensure_item(rid, c_desserts, 'Gulab Jamun',         'Soft milk dumplings in rose-cardamom syrup',                                 'https://images.unsplash.com/photo-1601303516534-4dc16d2b6f49?w=900',  120, 'veg',     4.7, 290, false, false);
  perform _ensure_item(rid, c_bev,      'Masala Chai',         'Traditional spiced milk tea',                                                'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?w=900',   60, 'veg',     4.6, 150, false, false);

  -- Variants + modifiers for Paneer Tikka
  select id into m_paneer from menu_items where restaurant_id = rid and name = 'Paneer Tikka';
  if m_paneer is not null then
    insert into menu_variants (menu_item_id, name, price, sort_order, is_default)
    select m_paneer, 'Half (6 pcs)', 280, 1, true
    where not exists (select 1 from menu_variants where menu_item_id = m_paneer and name = 'Half (6 pcs)');

    insert into menu_variants (menu_item_id, name, price, sort_order, is_default)
    select m_paneer, 'Full (12 pcs)', 480, 2, false
    where not exists (select 1 from menu_variants where menu_item_id = m_paneer and name = 'Full (12 pcs)');

    insert into menu_modifiers (menu_item_id, group_name, name, price_delta, is_required, sort_order)
    select m_paneer, 'Add-ons', 'Extra Mint Chutney', 20, false, 1
    where not exists (select 1 from menu_modifiers where menu_item_id = m_paneer and name = 'Extra Mint Chutney');

    insert into menu_modifiers (menu_item_id, group_name, name, price_delta, is_required, sort_order)
    select m_paneer, 'Add-ons', 'Cheese Topping', 40, false, 2
    where not exists (select 1 from menu_modifiers where menu_item_id = m_paneer and name = 'Cheese Topping');
  end if;
end;
$fn$;

create or replace function _ensure_item(
  rid uuid, cid uuid, item_name text, item_desc text, img text,
  price numeric, ftype food_type, r numeric, rc int, bs boolean, rec boolean
) returns void
language plpgsql
as $fn$
begin
  insert into menu_items (restaurant_id, category_id, name, description, image_url, base_price, food_type, rating, rating_count, is_bestseller, is_recommended)
  select rid, cid, item_name, item_desc, img, price, ftype, r, rc, bs, rec
  where not exists (select 1 from menu_items where restaurant_id = rid and name = item_name);
end;
$fn$;

-- ────────────────────────────────────────────────────────────
-- Apply seed for each branch
-- ────────────────────────────────────────────────────────────
do $$
declare
  r_sg     uuid;
  r_sg_kor uuid;
  r_sg_ind uuid;
begin
  select id into r_sg     from restaurants where slug = 'spice-garden';
  select id into r_sg_kor from restaurants where slug = 'spice-garden-koramangala';
  select id into r_sg_ind from restaurants where slug = 'spice-garden-indiranagar';

  -- Dining tables (8 per branch). dining_tables has unique (restaurant_id, label)
  if r_sg is not null then
    insert into dining_tables (restaurant_id, label, qr_token) values
      (r_sg, 'Table 1',  'sg-mg-t1'),  (r_sg, 'Table 2',  'sg-mg-t2'),
      (r_sg, 'Table 3',  'sg-mg-t3'),  (r_sg, 'Table 4',  'sg-mg-t4'),
      (r_sg, 'Table 5',  'sg-mg-t5'),  (r_sg, 'Table 6',  'sg-mg-t6'),
      (r_sg, 'Table 7',  'sg-mg-t7'),  (r_sg, 'Table 8',  'sg-mg-t8')
    on conflict do nothing;
    perform _seed_branch_menu(r_sg);
  end if;

  if r_sg_kor is not null then
    insert into dining_tables (restaurant_id, label, qr_token) values
      (r_sg_kor, 'Table 1', 'sgkor-t1'), (r_sg_kor, 'Table 2', 'sgkor-t2'),
      (r_sg_kor, 'Table 3', 'sgkor-t3'), (r_sg_kor, 'Table 4', 'sgkor-t4'),
      (r_sg_kor, 'Table 5', 'sgkor-t5'), (r_sg_kor, 'Table 6', 'sgkor-t6'),
      (r_sg_kor, 'Table 7', 'sgkor-t7'), (r_sg_kor, 'Table 8', 'sgkor-t8')
    on conflict do nothing;
    perform _seed_branch_menu(r_sg_kor);
  end if;

  if r_sg_ind is not null then
    insert into dining_tables (restaurant_id, label, qr_token) values
      (r_sg_ind, 'Table 1', 'sgind-t1'), (r_sg_ind, 'Table 2', 'sgind-t2'),
      (r_sg_ind, 'Table 3', 'sgind-t3'), (r_sg_ind, 'Table 4', 'sgind-t4'),
      (r_sg_ind, 'Table 5', 'sgind-t5'), (r_sg_ind, 'Table 6', 'sgind-t6'),
      (r_sg_ind, 'Table 7', 'sgind-t7'), (r_sg_ind, 'Table 8', 'sgind-t8')
    on conflict do nothing;
    perform _seed_branch_menu(r_sg_ind);
  end if;

  -- Per-branch featured coupons (idempotent on (restaurant_id, code))
  if r_sg is not null then
    insert into coupons (restaurant_id, code, description, type, value, min_order_value, max_discount, is_active, conditions, applies_to)
    values (r_sg, 'SG200', 'Flat ₹200 off above ₹500', 'flat', 200, 500, null, true, '{"banner":true,"featured":true}'::jsonb, array['dine_in','takeaway']::text[])
    on conflict do nothing;
  end if;
  if r_sg_kor is not null then
    insert into coupons (restaurant_id, code, description, type, value, min_order_value, max_discount, is_active, conditions, applies_to)
    values (r_sg_kor, 'KOR150', '₹150 off your first order', 'flat', 150, 400, null, true, '{"banner":true,"featured":true}'::jsonb, array['dine_in','takeaway']::text[])
    on conflict do nothing;
  end if;
  if r_sg_ind is not null then
    insert into coupons (restaurant_id, code, description, type, value, min_order_value, max_discount, is_active, conditions, applies_to)
    values (r_sg_ind, 'IND20', '20% off main course', 'percent', 20, 300, 120, true, '{"banner":true,"featured":true}'::jsonb, array['dine_in','takeaway']::text[])
    on conflict do nothing;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- RLS adjustment for the customer-facing path:
-- Allow ANY authenticated user (including anonymous) to insert an order
-- into a restaurant that exists. Order ownership is via customer_id.
-- Server-side Edge Functions will later re-price, but for MVP this lets
-- the customer app place orders directly.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists orders_customer_insert on orders;
create policy orders_customer_insert on orders
  for insert
  with check (
    exists (select 1 from restaurants r where r.id = restaurant_id and r.is_open = true)
  );

drop policy if exists order_items_customer_insert on order_items;
create policy order_items_customer_insert on order_items
  for insert
  with check (
    exists (select 1 from orders o where o.id = order_id)
  );

-- Customers can read their own order back (anonymous-safe via order code lookup
-- handled by Edge Function in prod; for now we allow read-by-code for any user)
drop policy if exists orders_read_by_code on orders;
create policy orders_read_by_code on orders
  for select
  using (true);  -- TODO: tighten via short-lived order_code JWT in production

drop policy if exists order_items_read_for_order on order_items;
create policy order_items_read_for_order on order_items
  for select
  using (exists (select 1 from orders o where o.id = order_id));

drop policy if exists order_events_read_for_order on order_status_events;
create policy order_events_read_for_order on order_status_events
  for select
  using (exists (select 1 from orders o where o.id = order_id));

-- Public reads for menu data (so the customer app can fetch without auth)
-- These were already permissive in 0002 but re-asserted here for clarity.
drop policy if exists restaurants_public_select_v2 on restaurants;
create policy restaurants_public_select_v2 on restaurants for select using (true);

drop policy if exists categories_public_select_v2 on categories;
create policy categories_public_select_v2 on categories for select using (true);

drop policy if exists menu_items_public_select_v2 on menu_items;
create policy menu_items_public_select_v2 on menu_items for select using (true);

drop policy if exists menu_variants_public_select_v2 on menu_variants;
create policy menu_variants_public_select_v2 on menu_variants for select using (true);

drop policy if exists menu_modifiers_public_select_v2 on menu_modifiers;
create policy menu_modifiers_public_select_v2 on menu_modifiers for select using (true);

drop policy if exists tables_public_select_v2 on dining_tables;
create policy tables_public_select_v2 on dining_tables for select using (is_active = true);

drop policy if exists coupons_public_select_v2 on coupons;
create policy coupons_public_select_v2 on coupons for select using (is_active = true);

-- Customers table — allow anon clients to create/update their own row.
-- MVP-grade policy. In production, replace with auth.uid() ownership.
drop policy if exists customers_anon_insert on customers;
create policy customers_anon_insert on customers for insert with check (true);

drop policy if exists customers_anon_select on customers;
create policy customers_anon_select on customers for select using (true);

drop policy if exists customers_anon_update on customers;
create policy customers_anon_update on customers for update using (true) with check (true);

-- Restaurant staff can read all orders + items + events (for admin live feed).
-- Existing policies already cover this; add a fallthrough so service_role
-- and authenticated users can read in dev.
-- (No-op block — kept here as a placeholder for future tightening.)

-- ════════════════════════════════════════════════════════════════════
-- Bootstrap policies for first-time auth signup.
-- These let the very first authenticated user self-promote to super admin
-- and self-link as restaurant staff. Tighten before going live.
-- ════════════════════════════════════════════════════════════════════

-- Allow an authenticated user to read platform_admins headcount (for
-- "is this the first signup?" check). Already covered by padmins_self_read
-- for their own row; add a permissive count-only read.
drop policy if exists platform_admins_count_read on platform_admins;
create policy platform_admins_count_read on platform_admins
  for select using (auth.role() = 'authenticated');

-- Allow inserting yourself into platform_admins ONLY when the table is empty.
-- After the first row exists, all further inserts must go through
-- service-role (or an Edge Function that uses service-role).
drop policy if exists platform_admins_first_signup on platform_admins;
create policy platform_admins_first_signup on platform_admins
  for insert with check (
    user_id = auth.uid()
    and not exists (select 1 from platform_admins)
  );

-- Restaurant staff: a super admin can grant access to any branch. After they
-- promote themselves, they manage staff through the admin UI which uses the
-- existing staff_manage_by_owner policy.
drop policy if exists staff_super_admin_all on restaurant_staff;
create policy staff_super_admin_all on restaurant_staff for all
  using (is_platform_admin()) with check (is_platform_admin());

-- Convenience function: claim a branch as owner (only super admins can call this).
create or replace function claim_branch_as_owner(rid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not is_platform_admin() then
    raise exception 'Only platform admins can claim branches';
  end if;
  insert into restaurant_staff (restaurant_id, user_id, role, display_name)
  values (rid, auth.uid(), 'owner',
    coalesce((select display_name from platform_admins where user_id = auth.uid()), 'Owner'))
  on conflict (restaurant_id, user_id) do update set role = excluded.role;
end;
$fn$;

grant execute on function claim_branch_as_owner(uuid) to authenticated;

-- Allow super admins to insert restaurant_staff (already covered by above)
-- and to read organizations/restaurants they don't own (covered by is_platform_admin
-- checks already in earlier policies).

-- ════════════════════════════════════════════════════════════════════
-- Invite helpers: callable client-side by the right roles.
--
-- These look up auth.users by email (which isn't directly readable from the
-- anon role) and create the appropriate role link. They run security definer
-- so they can bypass RLS, but enforce caller permission inside the body.
-- ════════════════════════════════════════════════════════════════════

create or replace function add_staff_by_email(rid uuid, member_email text, member_role staff_role)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target_uid uuid;
  target_name text;
begin
  -- Caller must be owner of the branch OR a platform admin.
  if not (is_platform_admin() or exists (
    select 1 from restaurant_staff
    where restaurant_id = rid and user_id = auth.uid() and role in ('owner','manager')
  )) then
    raise exception 'Not authorized to add staff to this branch';
  end if;

  select id, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
    into target_uid, target_name
  from auth.users where email = member_email limit 1;

  if target_uid is null then
    raise exception 'No user found with email %. They must sign up at /login first.', member_email;
  end if;

  insert into restaurant_staff (restaurant_id, user_id, role, display_name)
  values (rid, target_uid, member_role, target_name)
  on conflict (restaurant_id, user_id) do update set role = excluded.role;
end;
$fn$;

grant execute on function add_staff_by_email(uuid, text, staff_role) to authenticated;

create or replace function add_platform_admin_by_email(member_email text, member_role text default 'support')
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target_uid uuid;
  target_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only platform admins can add platform admins';
  end if;

  if member_role not in ('super_admin','support','finance') then
    raise exception 'Invalid role: %', member_role;
  end if;

  select id, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
    into target_uid, target_name
  from auth.users where email = member_email limit 1;

  if target_uid is null then
    raise exception 'No user found with email %. They must sign up at /login first.', member_email;
  end if;

  insert into platform_admins (user_id, role, display_name)
  values (target_uid, member_role, target_name)
  on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name;
end;
$fn$;

grant execute on function add_platform_admin_by_email(text, text) to authenticated;

create or replace function remove_staff(rid uuid, target_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not (is_platform_admin() or exists (
    select 1 from restaurant_staff
    where restaurant_id = rid and user_id = auth.uid() and role in ('owner','manager')
  )) then
    raise exception 'Not authorized to remove staff';
  end if;
  delete from restaurant_staff where restaurant_id = rid and user_id = target_uid;
end;
$fn$;

grant execute on function remove_staff(uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- One-shot branch setup: tables + starter menu.
-- Called automatically after a branch is created in Super Admin, and
-- exposed via the "Seed default tables/menu" button on empty pages.
-- ════════════════════════════════════════════════════════════════════
create or replace function seed_new_branch(rid uuid, table_count int default 8)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  slug_val text;
  i int;
  tab_label text;
  tok text;
begin
  -- Caller must be staff of this branch OR a platform admin OR no-staff-exists
  -- (the last clause lets a brand-new tenant bootstrap before any owner is linked).
  if not (
    is_platform_admin()
    or is_staff_of(rid)
    or not exists (select 1 from restaurant_staff where restaurant_id = rid)
  ) then
    raise exception 'Not authorized to seed branch %', rid;
  end if;

  select slug into slug_val from restaurants where id = rid;
  if slug_val is null then
    raise exception 'Restaurant % not found', rid;
  end if;

  for i in 1..table_count loop
    tab_label := 'Table ' || i::text;
    tok := slug_val || '-t' || i::text;
    insert into dining_tables (restaurant_id, label, qr_token)
    values (rid, tab_label, tok)
    on conflict do nothing;
  end loop;

  -- Seed menu using existing helper (categories + 10 starter items + variants/modifiers)
  perform _seed_branch_menu(rid);
end;
$fn$;

grant execute on function seed_new_branch(uuid, int) to authenticated;

create or replace function seed_default_menu(rid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not (is_platform_admin() or is_staff_of(rid)) then
    raise exception 'Not authorized';
  end if;
  perform _seed_branch_menu(rid);
end;
$fn$;

grant execute on function seed_default_menu(uuid) to authenticated;

create or replace function seed_default_tables(rid uuid, table_count int default 8)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  slug_val text;
  i int;
  tok text;
begin
  if not (is_platform_admin() or is_staff_of(rid)) then
    raise exception 'Not authorized';
  end if;
  select slug into slug_val from restaurants where id = rid;
  for i in 1..table_count loop
    insert into dining_tables (restaurant_id, label, qr_token)
    values (rid, 'Table ' || i::text, slug_val || '-t' || i::text)
    on conflict do nothing;
  end loop;
end;
$fn$;

grant execute on function seed_default_tables(uuid, int) to authenticated;
