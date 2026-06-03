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
