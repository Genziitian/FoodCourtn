-- ════════════════════════════════════════════════════════════════════
-- Quick-fix grants for tables created AFTER you ran dev_grants.sql.
-- Symptoms:
--   • SuperSupport page shows empty even though tickets exist
--   • Org admin manage modal can't list admins
--   • "permission denied" on org_admins or support_tickets
--
-- Cause: GRANT statements only apply to tables that exist at the time of
-- the grant. dev_grants.sql ran first; support_tickets + org_admins were
-- created later by feature_pack.sql / org_admins.sql.
--
-- Paste into Supabase SQL Editor → Run. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════

-- Make sure RLS is off on these (idempotent)
alter table if exists support_tickets disable row level security;
alter table if exists org_admins        disable row level security;

-- Explicit anon + authenticated access
grant select, insert, update, delete on support_tickets to anon, authenticated;
grant select, insert, update, delete on org_admins        to anon, authenticated;

-- Also re-grant on every public-schema table to cover anything else
-- that might have been missed (cheap, idempotent).
grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all functions in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables    to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Verify:
-- ════════════════════════════════════════════════════════════════════
-- select count(*) as tickets from support_tickets;
-- select count(*) as org_admins from org_admins;
