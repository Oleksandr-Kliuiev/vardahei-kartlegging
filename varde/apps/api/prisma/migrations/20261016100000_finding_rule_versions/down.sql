-- Down migration for 20261016100000_finding_rule_versions (hand-written; test databases and
-- rollback only: the computed-once markers of releases and version timestamps are dropped).
DROP TRIGGER IF EXISTS "finding_set_immutable" ON "finding_set";
DROP TRIGGER IF EXISTS "finding_immutable" ON "finding";
DROP FUNCTION IF EXISTS "finding_immutable"();
DROP TRIGGER IF EXISTS "finding_rule_immutable" ON "finding_rule";
DROP FUNCTION IF EXISTS "finding_rule_immutable"();
DROP TABLE IF EXISTS "finding_set";
ALTER TABLE "finding_rule" DROP COLUMN IF EXISTS "created_at";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016100000_finding_rule_versions';
