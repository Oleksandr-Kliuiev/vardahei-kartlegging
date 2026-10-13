-- Inside the Varde database (task 0.5), run by a superuser after varde-roles.sql:
--   psql -d varde -v ON_ERROR_STOP=1 < varde-db.sql
-- pg_read_all_data is never granted to Varde roles: it reads the Atlas databases too.
-- A superuser bypasses the login trigger with event_triggers=false, so the superuser holders
-- of the instance (Vardahei) are in the trusted circle of ADR-021 by name.
\set ON_ERROR_STOP on

-- Read-only backup role: every schema and table varde_app creates (public, pgboss from 0.9,
-- any future one). No IN SCHEMA on purpose.
GRANT USAGE ON SCHEMA public TO varde_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE varde_app GRANT SELECT ON TABLES TO varde_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE varde_app GRANT SELECT ON SEQUENCES TO varde_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE varde_app GRANT USAGE ON SCHEMAS TO varde_backup;

-- Connection journal (ADR-021 "trusted subjects"). Owned by varde_audit_owner: the database
-- owner varde_app owns public, not varde_audit, and cannot drop or rewrite the journal.
CREATE SCHEMA varde_audit AUTHORIZATION varde_audit_owner;
REVOKE ALL ON SCHEMA varde_audit FROM PUBLIC;
GRANT USAGE ON SCHEMA varde_audit TO varde_backup;
-- USAGE only: without it varde_app gets "permission denied for schema" when calling prune().
GRANT USAGE ON SCHEMA varde_audit TO varde_app;

CREATE TABLE varde_audit.connection_log (
  at timestamptz NOT NULL DEFAULT now(),
  role_name text NOT NULL DEFAULT session_user,
  application_name text,
  client_addr inet,
  backend_pid integer
);
CREATE INDEX connection_log_at_idx ON varde_audit.connection_log (at);
ALTER TABLE varde_audit.connection_log OWNER TO varde_audit_owner;
GRANT SELECT ON varde_audit.connection_log TO varde_backup;

CREATE FUNCTION varde_audit.log_login() RETURNS event_trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = varde_audit, pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO varde_audit.connection_log (at, role_name, application_name, client_addr, backend_pid)
  VALUES (now(), session_user, current_setting('application_name', true), inet_client_addr(),
          pg_backend_pid());
EXCEPTION WHEN OTHERS THEN
  -- The login is never blocked; the failure is visible in the server log.
  RAISE WARNING 'varde_audit: %', SQLERRM;
END
$$;
ALTER FUNCTION varde_audit.log_login() OWNER TO varde_audit_owner;

-- PG17: fires only for connections to this database.
CREATE EVENT TRIGGER varde_login ON login EXECUTE FUNCTION varde_audit.log_login();

-- Retention of the journal: 12 months, fixed here. Called by the retention job (1.31, class
-- connection_log in 0.19); EXECUTE only for varde_app (PUBLIC has it by default, and the
-- read-only varde_backup with its USAGE could otherwise prune the journal).
CREATE FUNCTION varde_audit.prune() RETURNS bigint
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = varde_audit, pg_catalog, pg_temp
AS $$
DECLARE
  removed bigint;
BEGIN
  DELETE FROM varde_audit.connection_log WHERE at < now() - interval '12 months';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END
$$;
ALTER FUNCTION varde_audit.prune() OWNER TO varde_audit_owner;
REVOKE EXECUTE ON FUNCTION varde_audit.prune() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION varde_audit.prune() TO varde_app;
-- log_login() returns event_trigger and cannot be called directly.
