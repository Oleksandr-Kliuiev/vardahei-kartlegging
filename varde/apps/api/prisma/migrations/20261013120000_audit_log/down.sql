-- Down migration for 20261013120000_audit_log (hand-written; Prisma does not generate downs).
DROP INDEX IF EXISTS "audit_log_what_at_idx";
DROP INDEX IF EXISTS "audit_log_at_idx";
DROP TABLE IF EXISTS "audit_log";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261013120000_audit_log';
