-- Down migration for 20261013140000_admin_session (hand-written; no respondent data).
DROP INDEX IF EXISTS "admin_session_expires_at_idx";
DROP TABLE IF EXISTS "admin_session";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261013140000_admin_session';
