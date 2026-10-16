-- Down migration for 20261016120000_seminars (hand-written; test databases and rollback only:
-- seminars, contacts, registrations, actions, finding statuses and participant deletions are dropped).
DROP TABLE IF EXISTS "participant_tombstone";
DELETE FROM "deletion_request" WHERE "scope" = 'participant';
ALTER TABLE "deletion_request" DROP CONSTRAINT IF EXISTS "deletion_request_scope_check";
ALTER TABLE "deletion_request" ADD CONSTRAINT "deletion_request_scope_check"
  CHECK ("scope" IN ('client', 'respondent', 'submissions'));
DROP TABLE IF EXISTS "finding_status";
DROP TABLE IF EXISTS "finding_rule_action";
DROP TABLE IF EXISTS "action";
DROP TABLE IF EXISTS "registration";
DROP TABLE IF EXISTS "contact";
DROP TABLE IF EXISTS "seminar_client";
DROP TABLE IF EXISTS "revoked_seminar_code";
DROP TABLE IF EXISTS "seminar";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016120000_seminars';
