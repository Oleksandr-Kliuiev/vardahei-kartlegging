-- Down migration for 20261016160000_seminar_rounds (hand-written; test databases and rollback
-- only): the links stay in their columns (20261016120000_seminars), unchecked.
DROP INDEX IF EXISTS "seminar_round_after_once";
DROP TRIGGER IF EXISTS "seminar_round_before_after_type" ON "seminar";
DROP FUNCTION IF EXISTS "seminar_round_before_after_type"();
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016160000_seminar_rounds';
