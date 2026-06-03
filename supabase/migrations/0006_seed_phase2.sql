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
