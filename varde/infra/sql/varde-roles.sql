SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SET log_min_duration_statement = -1;
-- Varde roles and database (task 0.5, ADR-016, ADR-003). Instance level: run by a superuser
-- in the database `postgres` (unix socket inside atlas-db-1, see infra/sql/README.md).
-- The three SET lines above keep the statements with passwords out of the server log.
--
-- psql variables (fed on stdin by bootstrap.sh as \set lines, never in argv):
--   app_pw, backup_pw  role passwords (hex); the server stores SCRAM verifiers
--                      (password_encryption = scram-sha-256 by default in PG17)
--   role_limit         CONNECTION LIMIT of varde_app (config/db-budget.json role_connection_limit)
--   dbname             database name, default varde (CI uses another name)
--
-- Re-running fails on "already exists": that is the guard against a double run.
-- pg_read_all_data is never granted to Varde roles: it reads the Atlas databases too.
-- A superuser bypasses the login trigger with event_triggers=false, so the superuser holders
-- of the instance (Vardahei) are in the trusted circle of ADR-021 by name.
\set ON_ERROR_STOP on
\if :{?dbname}
\else
\set dbname varde
\endif

CREATE ROLE varde_app LOGIN CONNECTION LIMIT :role_limit PASSWORD :'app_pw';
CREATE ROLE varde_backup LOGIN CONNECTION LIMIT 3 PASSWORD :'backup_pw';
CREATE ROLE varde_audit_owner NOLOGIN;
CREATE DATABASE :"dbname" OWNER varde_app;
REVOKE CONNECT ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO varde_app, varde_backup;
