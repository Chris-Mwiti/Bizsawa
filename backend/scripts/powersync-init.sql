-- Idempotent PowerSync bootstrap for local development.
--
-- Creates the replication role PowerSync connects with and the `powersync`
-- publication it subscribes to. Safe to re-run: the role is created only if
-- missing (and its password refreshed), and the publication is created once.
--
-- Invoked by the `powersync-init` compose service as POSTGRES_USER (the
-- database owner), because creating a publication and granting default
-- privileges requires ownership/superuser.

\set ON_ERROR_STOP on

-- 1. Replication role. REPLICATION enables logical decoding; BYPASSRLS keeps
--    PowerSync's read path working if row-level security is enabled later.
SELECT format(
         'CREATE ROLE %I WITH REPLICATION BYPASSRLS LOGIN PASSWORD %L',
         :'powersync_user', :'powersync_password'
       )
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'powersync_user')
\gexec

-- Refresh the password on re-run (e.g. after rotating it in .env).
ALTER ROLE :"powersync_user" WITH REPLICATION BYPASSRLS LOGIN PASSWORD :'powersync_password';

-- 2. Read-only access to current and future tables in the public schema.
GRANT CONNECT ON DATABASE :"powersync_db" TO :"powersync_user";
GRANT USAGE ON SCHEMA public TO :"powersync_user";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"powersync_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO :"powersync_user";

-- 3. Publication consumed by PowerSync (default name: powersync).
SELECT 'CREATE PUBLICATION powersync FOR ALL TABLES'
WHERE NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync')
\gexec

-- 4. Dedicated database for PowerSync bucket storage. It must be separate from
--    the replication source database. CREATE DATABASE is autocommitted by psql.
SELECT 'CREATE DATABASE powersync_storage'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'powersync_storage')
\gexec

-- 5. Verification output surfaced in the compose logs.
SHOW wal_level;
SELECT pubname, puballtables FROM pg_publication WHERE pubname = 'powersync';
SELECT rolname, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = :'powersync_user';
SELECT datname FROM pg_database WHERE datname = 'powersync_storage';
