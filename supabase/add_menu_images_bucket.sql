-- ──────────────────────────────────────────────────────────────────────────────
-- add_menu_images_bucket.sql
--
-- Creates the `menu-images` storage bucket the admin uses to host food photos
-- uploaded from the device (Combos / Menu Item editors). Public read so the
-- customer app can render <img src=…> directly without signed URLs.
--
-- Writes are restricted to signed-in users (admins / managers). Anonymous
-- writes are blocked — the customer never uploads to this bucket.
--
-- Safe to run multiple times.
-- ──────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

-- Public read for everyone.
drop policy if exists "menu_images_public_read" on storage.objects;
create policy "menu_images_public_read" on storage.objects
  for select using (bucket_id = 'menu-images');

-- Authenticated users (admins / managers) can upload.
drop policy if exists "menu_images_authenticated_write" on storage.objects;
create policy "menu_images_authenticated_write" on storage.objects
  for insert with check (bucket_id = 'menu-images' and auth.role() = 'authenticated');

-- Authenticated users can also overwrite / replace.
drop policy if exists "menu_images_authenticated_update" on storage.objects;
create policy "menu_images_authenticated_update" on storage.objects
  for update using (bucket_id = 'menu-images' and auth.role() = 'authenticated');

-- Authenticated users can delete (e.g. when removing a menu item).
drop policy if exists "menu_images_authenticated_delete" on storage.objects;
create policy "menu_images_authenticated_delete" on storage.objects
  for delete using (bucket_id = 'menu-images' and auth.role() = 'authenticated');
