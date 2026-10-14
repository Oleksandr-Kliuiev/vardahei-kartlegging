-- Down migration for 20261014100000_survey_templates (hand-written; templates only, no answers).
DROP TRIGGER IF EXISTS "template_version_immutable" ON "template_version";
DROP FUNCTION IF EXISTS "template_version_immutable"();
DROP TABLE IF EXISTS "template_version";
DROP TABLE IF EXISTS "survey_template";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014100000_survey_templates';
