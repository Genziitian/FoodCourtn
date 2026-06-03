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
