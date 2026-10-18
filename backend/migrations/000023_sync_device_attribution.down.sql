ALTER TABLE conflicts DROP COLUMN IF EXISTS client_device_id;
ALTER TABLE conflicts DROP COLUMN IF EXISTS server_device_id;
DROP TABLE IF EXISTS lww_applications;
DROP TABLE IF EXISTS record_writers;
