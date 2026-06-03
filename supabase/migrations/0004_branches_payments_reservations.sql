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
