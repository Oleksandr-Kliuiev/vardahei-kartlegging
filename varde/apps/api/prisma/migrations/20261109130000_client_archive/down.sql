-- Down migration for 20261109130000_client_archive (hand-written; test databases and rollback
-- only): the archive mark goes, and every client is in the lists again. Nothing else is touched.
ALTER TABLE "client" DROP COLUMN IF EXISTS "archived_at";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261109130000_client_archive';
