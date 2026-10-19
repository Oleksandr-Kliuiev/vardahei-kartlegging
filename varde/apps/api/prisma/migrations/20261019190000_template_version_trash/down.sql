-- Down migration for 20261019190000_template_version_trash (hand-written; test databases and rollback
-- only): the trash marks go; drafts that were in the trash become ordinary drafts again.
ALTER TABLE "template_version" DROP CONSTRAINT IF EXISTS "template_version_trash_only_draft";
ALTER TABLE "template_version" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE "template_version" DROP COLUMN IF EXISTS "deleted_by";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261019190000_template_version_trash';
