-- ════════════════════════════════════════════════════════════════════
-- Org-level admins + branch managers.
--
-- Three role tiers in the system:
--   1. Super admin     (platform_admins)        — manages the whole platform
--   2. Org admin       (org_admins)             — manages ALL branches in 1 org
--   3. Branch manager  (restaurant_staff)       — manages 1 specific branch
--
-- Super admin creates an org PLUS the owner account. The owner is recorded in
-- org_admins, and an auto-link trigger writes a restaurant_staff row (role=owner)
-- for every existing branch of the org, and for any new branch added later.
--
-- Branch managers go straight into restaurant_staff with role='manager'.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Org admins table ───
create table if not exists org_admins (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null,                  -- auth.users.id (no FK so we don't fail on dev mode)
  display_name    text,
  email           text,
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists org_admins_user_idx on org_admins (user_id);

alter table org_admins disable row level security;
grant select, insert, update, delete on org_admins to anon, authenticated;

-- ─── 2. When an org admin is added, link them as owner of every existing branch ───
create or replace function link_org_admin_to_branches()
returns trigger
language plpgsql
as $fn$
begin
  insert into restaurant_staff (restaurant_id, user_id, role, display_name)
  select r.id, new.user_id, 'owner', coalesce(new.display_name, split_part(new.email, '@', 1), 'Owner')
  from restaurants r
  where r.organization_id = new.organization_id
  on conflict (restaurant_id, user_id) do update set role = excluded.role;
  return new;
end;
$fn$;

drop trigger if exists org_admin_links_branches on org_admins;
create trigger org_admin_links_branches
after insert on org_admins
for each row execute function link_org_admin_to_branches();

-- ─── 3. When a new branch is created, link all the org's owners to it ───
create or replace function link_new_branch_to_org_admins()
returns trigger
language plpgsql
as $fn$
begin
  if new.organization_id is not null then
    insert into restaurant_staff (restaurant_id, user_id, role, display_name)
    select new.id, oa.user_id, 'owner', coalesce(oa.display_name, split_part(oa.email, '@', 1), 'Owner')
    from org_admins oa
    where oa.organization_id = new.organization_id
    on conflict (restaurant_id, user_id) do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists branch_link_org_admins on restaurants;
create trigger branch_link_org_admins
after insert on restaurants
for each row execute function link_new_branch_to_org_admins();

-- ─── 4. RPC: super admin records an org owner. The auth.users row must already
--           exist (caller signs the user up via supabase.auth.signUp first). ───
create or replace function add_org_admin(
  org uuid,
  uid uuid,
  email_arg text default null,
  display_name_arg text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into org_admins (organization_id, user_id, email, display_name)
  values (org, uid, email_arg, display_name_arg)
  on conflict (organization_id, user_id) do update
    set email = coalesce(excluded.email, org_admins.email),
        display_name = coalesce(excluded.display_name, org_admins.display_name);
end;
$fn$;

grant execute on function add_org_admin(uuid, uuid, text, text) to anon, authenticated;

-- ─── 5. RPC: list org admins for a given organization ───
create or replace function list_org_admins(org uuid)
returns table (user_id uuid, email text, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, email, display_name, created_at
  from org_admins
  where organization_id = org
  order by created_at;
$$;

grant execute on function list_org_admins(uuid) to anon, authenticated;

-- ─── 6. RPC: remove an org admin (also unlinks them from branches) ───
create or replace function remove_org_admin(org uuid, uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from org_admins where organization_id = org and user_id = uid;
  delete from restaurant_staff
   where user_id = uid
     and restaurant_id in (select id from restaurants where organization_id = org);
end;
$fn$;

grant execute on function remove_org_admin(uuid, uuid) to anon, authenticated;

-- ─── 7. RPC: link an existing auth user as a branch manager ───
create or replace function add_branch_manager(
  rid uuid,
  uid uuid,
  display_name_arg text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into restaurant_staff (restaurant_id, user_id, role, display_name)
  values (rid, uid, 'manager', display_name_arg)
  on conflict (restaurant_id, user_id) do update set role = excluded.role;
end;
$fn$;

grant execute on function add_branch_manager(uuid, uuid, text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Verify:
-- ════════════════════════════════════════════════════════════════════
-- select * from org_admins;
-- select rs.restaurant_id, rs.user_id, rs.role, rs.display_name from restaurant_staff rs;
