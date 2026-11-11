-- Down migration for 20261111100000_survey_template_name (hand-written; test databases and rollback
-- only): the names go, and every survey is shown by its latest version's title again.
ALTER TABLE "survey_template" DROP COLUMN IF EXISTS "name";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111100000_survey_template_name';
