-- ════════════════════════════════════════════════════════════════════
-- FoodCourt — RESET SQL (destructive)
-- ════════════════════════════════════════════════════════════════════
-- WARNING: drops EVERYTHING in the `public` schema, including all tables,
-- types, functions, triggers, RLS policies, and the seed data.
--
-- Use only when you want a clean slate. After this, run setup.sql.
--
-- This DOES NOT touch:
--   - auth.* (Supabase Auth users stay intact)
--   - storage.* (uploaded files stay intact)
--   - any other schema
-- ════════════════════════════════════════════════════════════════════

drop schema if exists public cascade;
create schema public;

grant all on schema public to postgres;
grant all on schema public to anon;
grant all on schema public to authenticated;
grant all on schema public to service_role;

-- Restore default search_path
alter database postgres set search_path = public, extensions;
