-- ════════════════════════════════════════════════════════════════════
-- DEV MODE: grant anon + authenticated full access to the public schema.
--
-- This fixes "permission denied for table X" errors that remain even
-- after RLS is disabled. Cause: Postgres GRANTs on the table itself
-- (separate from RLS) are missing for the anon role.
--
-- ⚠️  Pairs with dev_disable_rls.sql. Run BOTH for full anon access.
-- Paste into Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

-- Schema-level access
grant usage on schema public to anon, authenticated;

-- All existing tables, sequences, functions
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all functions in schema public to anon, authenticated;

-- Future tables/sequences/functions inherit the grants too
alter default privileges in schema public
  grant all on tables    to anon, authenticated;
alter default privileges in schema public
  grant all on sequences to anon, authenticated;
alter default privileges in schema public
  grant all on functions to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Verify — should show anon has access to organizations:
-- ════════════════════════════════════════════════════════════════════
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'organizations'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
