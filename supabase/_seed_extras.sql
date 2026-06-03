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
