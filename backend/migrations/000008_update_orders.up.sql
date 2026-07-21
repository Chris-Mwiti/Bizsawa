-- 1. Add the payment_status column with a safe default value
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) NOT NULL DEFAULT 'pending';

-- 2. Create an index on the payment_status column
-- This is crucial for your background payment workers when they poll or lock 
-- orders based on their current payment execution phase.
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
