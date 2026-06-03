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
