-- Rollback of varde-roles.sql + varde-db.sql (task 0.5b): only before Varde has data.
-- Superuser in the database `postgres`; stop the app first (open sessions block DROP DATABASE).
-- Roles are cluster-wide: every test that creates Varde roles on the CI service runs this.
\set ON_ERROR_STOP on
\if :{?dbname}
\else
\set dbname varde
\endif
DROP DATABASE :"dbname";
DROP ROLE varde_app, varde_backup, varde_audit_owner;
