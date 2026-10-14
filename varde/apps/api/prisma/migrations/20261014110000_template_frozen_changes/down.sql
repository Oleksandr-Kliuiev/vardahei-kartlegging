-- Down migration for 20261014110000_template_frozen_changes (hand-written).
ALTER TABLE "template_version" DROP COLUMN IF EXISTS "frozen_changes";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014110000_template_frozen_changes';
