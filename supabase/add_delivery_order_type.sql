-- ════════════════════════════════════════════════════════════════════
-- Add 'delivery' to the order_type Postgres enum.
--
-- The customer cart and pricing logic already understand 'delivery',
-- but the Postgres `orders.type` column is an enum that only listed
-- ('dine_in', 'takeaway'). Without this migration, every delivery
-- order placement fails with:
--   invalid input value for enum order_type: "delivery"
--
-- Postgres needs `alter type … add value` (not a plain INSERT) to
-- extend an enum.
--
-- Idempotent: the IF NOT EXISTS clause skips the add when 'delivery'
-- is already present.
-- ════════════════════════════════════════════════════════════════════

alter type order_type add value if not exists 'delivery';

-- Verify
select unnest(enum_range(null::order_type)) as order_type_values;
