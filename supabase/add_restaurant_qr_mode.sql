-- ──────────────────────────────────────────────────────────────────────────────
-- add_restaurant_qr_mode.sql
--
-- QR strategy per branch:
--   'per_table' (default) — each table has its own QR; scan lands the
--                            customer directly on the menu, pre-bound to
--                            that table. Existing behaviour.
--   'single'              — ONE QR for the whole branch (e.g. one big poster
--                            at the entrance). Scan lands on a chooser page
--                            where the customer picks their table from a
--                            dropdown before continuing.
--
-- A single column on `restaurants` is enough — admins set it once per branch,
-- staff doesn't need to know.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.restaurants
  add column if not exists qr_mode text not null default 'per_table';

-- Belt-and-braces validation: only two valid modes.
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'restaurants' and column_name = 'qr_mode'
      and constraint_name = 'restaurants_qr_mode_check'
  ) then
    alter table public.restaurants
      add constraint restaurants_qr_mode_check
      check (qr_mode in ('per_table', 'single'));
  end if;
end$$;

comment on column public.restaurants.qr_mode is
  'per_table = one QR per dining table (default); single = one QR for the whole branch, customer picks table from a dropdown.';
