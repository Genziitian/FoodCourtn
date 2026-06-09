-- ════════════════════════════════════════════════════════════════════
-- Separate hero images for Landing vs Menu header.
--
-- Until now, both the customer Landing page (full-screen welcome) AND the
-- Menu page header strip both read from `restaurants.hero_images`.
-- Owners asked for finer control — different photos can suit each surface
-- (wide cinematic shots on landing, food close-ups on the menu strip).
--
-- This adds a parallel `menu_hero_images text[]` column. The customer
-- Menu page now prefers it; if empty, it falls back to `hero_images`,
-- then to `hero_image`, then to built-in default food photos.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

alter table restaurants
  add column if not exists menu_hero_images text[] default '{}'::text[];

-- For existing rows, seed menu_hero_images from hero_images so the UI
-- behaves the same as today out of the box.
update restaurants
   set menu_hero_images = hero_images
 where (menu_hero_images is null or array_length(menu_hero_images, 1) is null)
   and hero_images is not null
   and array_length(hero_images, 1) > 0;

select id, slug, name,
       coalesce(array_length(hero_images, 1), 0)      as landing_count,
       coalesce(array_length(menu_hero_images, 1), 0) as menu_count
from restaurants
order by created_at desc
limit 10;
