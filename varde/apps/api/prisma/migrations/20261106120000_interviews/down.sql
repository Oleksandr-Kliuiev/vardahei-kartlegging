-- Down migration for 20261106120000_interviews (hand-written; test databases and rollback only): the
-- conversations go; surveys, rounds and clients stay. The old audience check comes back NOT VALID, so a
-- rollback still works after an interview guide was published (published versions cannot be deleted).
DROP TABLE IF EXISTS "interview_answer";
DROP TABLE IF EXISTS "interview";
DROP TABLE IF EXISTS "interview_round";
ALTER TABLE "survey_template" DROP CONSTRAINT IF EXISTS "survey_template_audience_check";
ALTER TABLE "survey_template" ADD CONSTRAINT "survey_template_audience_check"
  CHECK ("audience" IN ('client_survey', 'seminar_live', 'seminar_after')) NOT VALID;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261106120000_interviews';
