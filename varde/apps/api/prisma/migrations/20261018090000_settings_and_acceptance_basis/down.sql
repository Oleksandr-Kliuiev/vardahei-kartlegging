-- Down migration for 20261018090000_settings_and_acceptance_basis (hand-written; test databases and
-- rollback only): the settings and the approval snapshots go; approvals themselves are untouched.
DROP TABLE IF EXISTS "app_setting";
ALTER TABLE "template_version" DROP COLUMN IF EXISTS "acceptance_basis";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261018090000_settings_and_acceptance_basis';
