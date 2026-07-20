-- 1. Drop the index first
DROP INDEX IF EXISTS idx_invoices_order;

-- 2. Drop the foreign key constraint
ALTER TABLE invoices 
DROP CONSTRAINT IF EXISTS fk_invoices_order;

-- 3. Remove the column entirely
ALTER TABLE invoices 
DROP COLUMN IF EXISTS order_id;
