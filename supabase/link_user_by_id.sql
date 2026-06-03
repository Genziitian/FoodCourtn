-- ════════════════════════════════════════════════════════════════════
-- Link a specific auth.users.id as org admin + branch staff.
--
-- Use this when the diagnose-by-email script linked the wrong duplicate
-- of an email (Supabase can carry leftover unconfirmed users). The
-- browser's signed-in session knows its real user_id (see DevTools), so
-- we target that exact id and nothing else.
--
-- Replace the two literals below if you're fixing a different account.
-- ════════════════════════════════════════════════════════════════════

-- 1. Show every auth.users row whose email matches — confirms whether
--    duplicates exist for this email.
select id, email, created_at, last_sign_in_at, email_confirmed_at
from auth.users
where email ilike 'spice@spice%';

-- 2. Show what the target user_id currently has.
select
  'aaff97eb-404b-41bd-93e1-e529c4016c13'::uuid as user_id,
  (select count(*) from org_admins       where user_id = 'aaff97eb-404b-41bd-93e1-e529c4016c13') as org_admin_rows,
  (select count(*) from restaurant_staff where user_id = 'aaff97eb-404b-41bd-93e1-e529c4016c13') as staff_rows;

-- 3. Insert org_admins row for the exact browser user_id, against
--    Spice Garden. The trigger `link_org_admin_to_branches` should
--    fan out into restaurant_staff for every branch in that org.
insert into org_admins (organization_id, user_id, email, display_name)
select o.id,
       'aaff97eb-404b-41bd-93e1-e529c4016c13'::uuid,
       'spice@spice.com',
       'Spice Owner'
from organizations o
where o.name ilike 'Spice Garden%'
on conflict (organization_id, user_id) do nothing;

-- 4. Fallback in case the trigger didn't fire: insert restaurant_staff
--    for every branch of Spice Garden.
insert into restaurant_staff (restaurant_id, user_id, role, display_name)
select r.id,
       'aaff97eb-404b-41bd-93e1-e529c4016c13'::uuid,
       'owner',
       'Spice Owner'
from organizations o
join restaurants  r on r.organization_id = o.id
where o.name ilike 'Spice Garden%'
on conflict (restaurant_id, user_id) do update set role = excluded.role;

-- 5. Verify
select
  'aaff97eb-404b-41bd-93e1-e529c4016c13'::uuid as user_id,
  (select count(*) from org_admins       where user_id = 'aaff97eb-404b-41bd-93e1-e529c4016c13') as org_admin_rows,
  (select count(*) from restaurant_staff where user_id = 'aaff97eb-404b-41bd-93e1-e529c4016c13') as staff_rows;
