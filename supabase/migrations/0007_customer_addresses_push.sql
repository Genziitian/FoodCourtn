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
