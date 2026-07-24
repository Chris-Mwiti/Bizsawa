-- 1. Add the order_id column with a safe default for pre-existing rows
ALTER TABLE payment_commands 
ADD COLUMN IF NOT EXISTS order_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

-- 2. Create the index for fast relational lookups
-- This ensures queries like .Where("order_id = ?", id) hit an index scan
CREATE INDEX IF NOT EXISTS idx_payment_commands_order_id ON payment_commands(order_id);

-- 3. (Optional) Clear the default for future inserts if your application 
-- layer should strictly enforce providing a valid UUID.
ALTER TABLE payment_commands ALTER COLUMN order_id DROP DEFAULT;
