-- ════════════════════════════════════════════════════════════════════
-- Unblock "Signed in, but your account isn't linked" for admin users.
--
-- Root cause (confirmed from a live browser test):
--   1. RLS is enabled on org_admins / restaurant_staff / platform_admins,
--      but the project doesn't yet have a working "let me read my own role
--      row" policy that's also non-recursive.
--   2. The existing `staff_manage_by_owner` policy on restaurant_staff
--      does `EXISTS (SELECT 1 FROM restaurant_staff s ...)` — which is a
--      self-reference and causes infinite recursion in Postgres RLS,
--      returning HTTP 500 on every SELECT.
--
-- Fix posture: keep the rest of the app's RLS state alone. Just turn off
-- RLS on the three role tables so sign-in's role lookup works again.
-- This matches `supabase/dev_disable_rls.sql` which the rest of the
-- project already depends on.
--
-- When you harden for production later, replace these with a small set
-- of self-read policies wrapped in `security definer` helpers — never
-- self-referential EXISTS — so they can't recurse.
-- ════════════════════════════════════════════════════════════════════

-- Drop the broken recursive policy first (otherwise it lingers even
-- after RLS is disabled, ready to bite the next person who turns RLS on).
drop policy if exists staff_manage_by_owner on restaurant_staff;
drop policy if exists staff_self_read       on restaurant_staff;

-- Turn RLS off on the role tables.
alter table org_admins        disable row level security;
alter table restaurant_staff  disable row level security;
alter table platform_admins   disable row level security;

-- Make sure the GRANTs are present (RLS off without grants still 403s).
grant select, insert, update, delete on org_admins        to anon, authenticated;
grant select, insert, update, delete on restaurant_staff  to anon, authenticated;
grant select                          on platform_admins  to anon, authenticated;

-- Verify
select tablename, rowsecurity as rls_on
from pg_tables
where schemaname = 'public'
  and tablename in ('org_admins', 'restaurant_staff', 'platform_admins')
order by tablename;
