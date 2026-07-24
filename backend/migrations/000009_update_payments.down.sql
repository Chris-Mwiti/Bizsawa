-- 1. Drop the order_id index first
DROP INDEX IF EXISTS idx_payment_commands_order_id;

-- 2. Remove the order_id column completely
ALTER TABLE payment_commands 
DROP COLUMN IF EXISTS order_id;
