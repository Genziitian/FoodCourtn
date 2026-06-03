-- ════════════════════════════════════════════════════════════════════
-- Diagnose + fix "Signed in, but your account isn't linked" for a given email.
--
-- This script:
--   1. Shows the auth.users row + any role links the user has
--   2. Re-grants permissions on org_admins / restaurant_staff / platform_admins
--      to the authenticated role (in case the GRANT was missing)
--   3. If you know which org they should belong to, the bottom block links them.
--
-- USAGE: change the email below (search-replace 'spice@spice.com'), run the
-- whole script in Supabase → SQL Editor, look at the verify output at the end.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Where does the user stand today? ──
select
  u.id           as user_id,
  u.email,
  u.created_at,
  case when pa.user_id is not null then '✓' else '·' end as is_platform_admin,
  count(distinct oa.organization_id) as org_admin_of,
  count(distinct rs.restaurant_id)   as restaurant_staff_of
from auth.users u
left join platform_admins pa on pa.user_id = u.id
left join org_admins oa on oa.user_id = u.id
left join restaurant_staff rs on rs.user_id = u.id
where u.email = 'spice@spice.com'
group by u.id, u.email, u.created_at, pa.user_id;

-- ── 2. List every org link this user currently has ──
select o.name as organization, oa.created_at
from auth.users u
join org_admins oa on oa.user_id = u.id
join organizations o on o.id = oa.organization_id
where u.email = 'spice@spice.com';

-- ── 3. List every branch link this user currently has ──
select r.name as branch, rs.role, rs.created_at
from auth.users u
join restaurant_staff rs on rs.user_id = u.id
join restaurants r on r.id = rs.restaurant_id
where u.email = 'spice@spice.com';

-- ── 4. Make sure the authenticated role can SELECT these tables ──
-- (RLS being off doesn't help if GRANTs are missing.)
grant select, insert, update, delete on org_admins        to anon, authenticated;
grant select, insert, update, delete on restaurant_staff  to anon, authenticated;
grant select on platform_admins to anon, authenticated;

-- ── 5. FIX: link spice@spice.com to "Spice Garden Hospitality" ──
-- This is safe to re-run; on conflict it does nothing.
insert into org_admins (organization_id, user_id, email, display_name)
select
  o.id,
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
cross join organizations o
where u.email = 'spice@spice.com'
  and o.name ilike 'Spice Garden%'
on conflict (organization_id, user_id) do nothing;

-- The trigger `link_org_admin_to_branches` (from org_admins.sql) auto-creates
-- a restaurant_staff row for every existing branch. If that trigger doesn't
-- exist, this fallback does the same job:
insert into restaurant_staff (restaurant_id, user_id, role, display_name)
select
  r.id,
  u.id,
  'owner',
  coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
join organizations o on o.name ilike 'Spice Garden%'
join restaurants r on r.organization_id = o.id
where u.email = 'spice@spice.com'
on conflict (restaurant_id, user_id) do update set role = excluded.role;

-- ── 6. Verify — should now show org_admin_of ≥ 1 and restaurant_staff_of = number of branches ──
select
  u.email,
  count(distinct oa.organization_id) as org_admin_of,
  count(distinct rs.restaurant_id)   as restaurant_staff_of
from auth.users u
left join org_admins oa on oa.user_id = u.id
left join restaurant_staff rs on rs.user_id = u.id
where u.email = 'spice@spice.com'
group by u.email;
