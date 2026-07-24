-- 1. Drop the index associated with invoice_id if it exists
DROP INDEX IF EXISTS idx_payment_commands_invoice_id;

-- 2. Cleanly drop the column from the table
ALTER TABLE payment_commands 
DROP COLUMN IF EXISTS invoice_id CASCADE;
