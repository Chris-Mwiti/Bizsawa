-- 1. Re-add the column as a nullable UUID to avoid constraint errors on historical data
ALTER TABLE payment_commands 
ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- 2. Explicitly re-apply the foreign key constraint referencing the invoices table
ALTER TABLE payment_commands
ADD CONSTRAINT payment_commands_invoice_id_fkey 
FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

-- 3. Re-create the performance index for the column
CREATE INDEX IF NOT EXISTS idx_payment_commands_invoice_id 
ON payment_commands(invoice_id);
