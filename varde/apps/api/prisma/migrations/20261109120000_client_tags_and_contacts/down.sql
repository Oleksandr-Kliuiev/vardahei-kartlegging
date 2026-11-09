-- Down migration for 20261109120000_client_tags_and_contacts (hand-written; test databases and
-- rollback only): the tags of the clients and the mark on contacts Vardahei entered go. The clients
-- and the contacts themselves stay; a contact that was kept only by that mark is then an unused
-- leftover again, and the daily job takes it.
ALTER TABLE "client" DROP COLUMN IF EXISTS "tags";
ALTER TABLE "contact" DROP COLUMN IF EXISTS "kept_by_admin";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261109120000_client_tags_and_contacts';
