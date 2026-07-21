-- 1. Drop the payment status index first
DROP INDEX IF EXISTS idx_orders_payment_status;

-- 2. Remove the payment_status column entirely
ALTER TABLE orders 
DROP COLUMN IF EXISTS payment_status;
