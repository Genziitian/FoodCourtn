-- ════════════════════════════════════════════════════════════════════
-- Restaurant feature-image carousel.
--
-- The customer Landing page used to show a single `restaurants.hero_image`.
-- This adds a `hero_images text[]` column so the owner can paste 3–5
-- images and the customer page auto-cycles through them.
--
-- Backwards-compatible:
--   • The old `hero_image` column stays. If `hero_images` is empty/null
--     the UI falls back to the single image, then to a default.
--   • Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════

alter table restaurants
  add column if not exists hero_images text[] default '{}'::text[];

-- For existing rows that already have a single hero_image, seed the array
-- with it so the slider works out of the box.
update restaurants
   set hero_images = array[hero_image]
 where (hero_images is null or array_length(hero_images, 1) is null)
   and hero_image is not null
   and length(trim(hero_image)) > 0;

-- Sanity check
select id, slug, name, hero_image, hero_images
from restaurants
order by created_at desc
limit 10;
