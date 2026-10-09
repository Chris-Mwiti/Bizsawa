-- loadtests/cleanup.sql — purge k6 load-test rows for one business, FK order.
--
-- Usage:
--   psql "$DATABASE_URL" -v BUSINESS_ID="<uuid>" -f loadtests/cleanup.sql
--
-- Matches the markers the suite writes (see modules/*.js, lib/helpers.js).
-- All text markers are PREFIX matches (LIKE 'k6%'): every fixture the suite
-- creates starts with lowercase 'k6'. Phone numbers are deliberately NOT
-- used as markers — k6 generates 2547… numbers indistinguishable from real
-- Kenyan numbers, so customers match on name only.
--   products      name/sku    LIKE 'k6%'   (k6-prod-*, k6-sync-*, fixture creates)
--   customers     name      LIKE 'k6-%'   (k6-cust-*, k6-sync-cust-*)
--   expenses      description/vendor LIKE 'k6%'
--   tax_rules     name      LIKE 'k6%'   (k6-vat-*)
--   invoice_lines description LIKE 'k6%' (k6 load-test item)
--   stock_movements notes LIKE 'k6%' + refs to k6 sales/orders/products
--   auth_users    email LIKE 'k6-invitee-%@example.com' (users.js registers
--                real users and adds them as CASHIER members of the business)
--
-- Only rows scoped to :BUSINESS_ID are touched, except k6-invitee auth_users,
-- which are deleted only when they hold no membership in any other business.
-- analytics_snapshots for the business are also cleared — they are a
-- recomputed cache (sale/void paths already invalidate them the same way).
-- Each statement prints `DELETE n` — that is your per-table purge stat.

\set ON_ERROR_STOP on

\if :{?BUSINESS_ID}
\else
\echo 'ERROR: psql variable BUSINESS_ID is required.'
\echo 'Usage: psql "$DATABASE_URL" -v BUSINESS_ID="<uuid>" -f loadtests/cleanup.sql'
\quit 1
\endif

BEGIN;

-- 0. Collect the k6 id sets for this business.
CREATE TEMP TABLE k6_products AS
SELECT id FROM products
WHERE business_id = :'BUSINESS_ID'::uuid
  AND (name LIKE 'k6%' OR sku LIKE 'k6%');

CREATE TEMP TABLE k6_customers AS
SELECT id FROM customers
WHERE business_id = :'BUSINESS_ID'::uuid AND name LIKE 'k6%';

CREATE TEMP TABLE k6_orders AS
SELECT o.id FROM orders o
WHERE o.business_id = :'BUSINESS_ID'::uuid
  AND (o.customer_id IN (SELECT id FROM k6_customers)
    OR o.id IN (SELECT DISTINCT ol.order_id FROM order_lines ol
                WHERE ol.business_id = :'BUSINESS_ID'::uuid
                  AND ol.product_id IN (SELECT id FROM k6_products)));

CREATE TEMP TABLE k6_sales AS
SELECT s.id FROM sales s
WHERE s.business_id = :'BUSINESS_ID'::uuid
  AND (s.order_id IN (SELECT id FROM k6_orders)
    OR s.customer_id IN (SELECT id FROM k6_customers)
    OR s.id IN (SELECT DISTINCT sl.sale_id FROM sale_lines sl
                WHERE sl.business_id = :'BUSINESS_ID'::uuid
                  AND sl.product_id IN (SELECT id FROM k6_products)));

CREATE TEMP TABLE k6_invoices AS
SELECT i.id FROM invoices i
WHERE i.business_id = :'BUSINESS_ID'::uuid
  AND (i.order_id IN (SELECT id FROM k6_orders)
    OR i.customer_id IN (SELECT id FROM k6_customers)
    OR i.id IN (SELECT DISTINCT il.invoice_id FROM invoice_lines il
                WHERE il.business_id = :'BUSINESS_ID'::uuid
                  AND (il.product_id IN (SELECT id FROM k6_products)
                    OR il.description LIKE 'k6%'))
    OR i.notes LIKE 'k6%');

CREATE TEMP TABLE k6_expenses AS
SELECT id FROM expenses
WHERE business_id = :'BUSINESS_ID'::uuid
  AND (description LIKE 'k6%' OR vendor LIKE 'k6%' OR category LIKE 'k6%');

CREATE TEMP TABLE k6_tax_rules AS
SELECT id FROM tax_rules
WHERE business_id = :'BUSINESS_ID'::uuid AND name LIKE 'k6%';

CREATE TEMP TABLE k6_users AS
SELECT id FROM auth_users WHERE email LIKE 'k6-invitee-%@example.com';

-- 1. Line items (children of sales / orders / invoices).
DELETE FROM sale_lines
WHERE business_id = :'BUSINESS_ID'::uuid AND sale_id IN (SELECT id FROM k6_sales);
DELETE FROM order_lines
WHERE business_id = :'BUSINESS_ID'::uuid AND order_id IN (SELECT id FROM k6_orders);
DELETE FROM invoice_lines
WHERE business_id = :'BUSINESS_ID'::uuid AND invoice_id IN (SELECT id FROM k6_invoices);

-- 2. Ledger + commands referencing k6 docs/products.
DELETE FROM stock_movements
WHERE business_id = :'BUSINESS_ID'::uuid
  AND (product_id IN (SELECT id FROM k6_products)
    OR reference_id IN (SELECT id FROM k6_sales)
    OR reference_id IN (SELECT id FROM k6_orders)
    OR notes LIKE 'k6%');
DELETE FROM payment_commands
WHERE business_id = :'BUSINESS_ID'::uuid AND order_id IN (SELECT id FROM k6_orders);
DELETE FROM tax_entries
WHERE business_id = :'BUSINESS_ID'::uuid
  AND (source_id IN (SELECT id FROM k6_sales)
    OR source_id IN (SELECT id FROM k6_orders)
    OR source_id IN (SELECT id FROM k6_invoices));

-- 3. The documents themselves.
DELETE FROM sales
WHERE business_id = :'BUSINESS_ID'::uuid AND id IN (SELECT id FROM k6_sales);
DELETE FROM orders
WHERE business_id = :'BUSINESS_ID'::uuid AND id IN (SELECT id FROM k6_orders);
DELETE FROM invoices
WHERE business_id = :'BUSINESS_ID'::uuid AND id IN (SELECT id FROM k6_invoices);

-- 4. Inventory + variants tied to k6 products.
DELETE FROM inventory_items
WHERE business_id = :'BUSINESS_ID'::uuid AND product_id IN (SELECT id FROM k6_products);
DELETE FROM product_variants
WHERE business_id = :'BUSINESS_ID'::uuid AND product_id IN (SELECT id FROM k6_products);

-- 5. Standalone parents.
DELETE FROM expenses
WHERE business_id = :'BUSINESS_ID'::uuid AND id IN (SELECT id FROM k6_expenses);
DELETE FROM tax_rules
WHERE business_id = :'BUSINESS_ID'::uuid AND id IN (SELECT id FROM k6_tax_rules);
DELETE FROM products
WHERE business_id = :'BUSINESS_ID'::uuid AND id IN (SELECT id FROM k6_products);
DELETE FROM customers
WHERE business_id = :'BUSINESS_ID'::uuid AND id IN (SELECT id FROM k6_customers);

-- 6. Memberships / invites created by the users module.
DELETE FROM business_members
WHERE business_id = :'BUSINESS_ID'::uuid AND user_id IN (SELECT id FROM k6_users);
DELETE FROM business_invites
WHERE business_id = :'BUSINESS_ID'::uuid AND email LIKE 'k6-%';
-- k6-invitee auth accounts with no remaining membership anywhere.
DELETE FROM auth_users u
WHERE u.id IN (SELECT id FROM k6_users)
  AND NOT EXISTS (SELECT 1 FROM business_members m WHERE m.user_id = u.id);

-- 7. Sync conflicts + cached analytics for the business.
DELETE FROM conflicts
WHERE business_id = :'BUSINESS_ID'::uuid
  AND (client_payload::text LIKE '%k6-%' OR server_payload::text LIKE '%k6-%');
DELETE FROM analytics_snapshots WHERE business_id = :'BUSINESS_ID'::uuid;

COMMIT;

-- 8. Post-purge verification: every count below must be 0.
-- (Self-contained: re-derives markers instead of reusing temp sets.)
SELECT 'products' AS table_name, COUNT(*) FROM products
WHERE business_id = :'BUSINESS_ID'::uuid AND (name LIKE 'k6%' OR sku LIKE 'k6%')
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
WHERE business_id = :'BUSINESS_ID'::uuid AND name LIKE 'k6%'
UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses
WHERE business_id = :'BUSINESS_ID'::uuid AND (description LIKE 'k6%' OR vendor LIKE 'k6%')
UNION ALL
SELECT 'tax_rules', COUNT(*) FROM tax_rules
WHERE business_id = :'BUSINESS_ID'::uuid AND name LIKE 'k6%'
UNION ALL
SELECT 'invoice_lines_k6_desc', COUNT(*) FROM invoice_lines
WHERE business_id = :'BUSINESS_ID'::uuid AND description LIKE 'k6%'
UNION ALL
SELECT 'business_members_k6', COUNT(*) FROM business_members m
JOIN auth_users u ON u.id = m.user_id
WHERE m.business_id = :'BUSINESS_ID'::uuid AND u.email LIKE 'k6-invitee-%@example.com';
