-- Dropping the table with CASCADE ensures that any dependent triggers,
-- constraints, or indexes are cleanly cleaned up by PostgreSQL.
DROP TABLE IF EXISTS outbox_events CASCADE;
