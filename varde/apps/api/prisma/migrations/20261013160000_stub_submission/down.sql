-- Down migration for 20261013160000_stub_submission (synthetic stand data only).
DROP INDEX IF EXISTS "stub_submission_submission_id_key";
DROP TABLE IF EXISTS "stub_submission";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261013160000_stub_submission';
