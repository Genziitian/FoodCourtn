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
