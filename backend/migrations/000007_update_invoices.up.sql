-- 1. Safely add the order_id column without breaking existing rows
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS order_id UUID;

-- 2. Add the foreign key constraint pointing to the orders table
-- Using ON DELETE SET NULL ensures that if an order is ever deleted, 
-- the historical invoice stays intact for accounting purposes.
ALTER TABLE invoices
ADD CONSTRAINT fk_invoices_order 
FOREIGN KEY (order_id) REFERENCES orders(id) 
ON DELETE SET NULL;

-- 3. Create an index on the new foreign key to keep queries lightning fast
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
