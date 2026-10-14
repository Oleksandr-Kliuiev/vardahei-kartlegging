-- Down migration for 20261014120000_rounds_responses (hand-written). Drops responses: only for
-- test databases and rollback of an empty deployment.
DROP TRIGGER IF EXISTS "response_respondent_key_mode" ON "response";
DROP FUNCTION IF EXISTS "response_respondent_key_mode"();
DROP TRIGGER IF EXISTS "round_freeze" ON "round";
DROP FUNCTION IF EXISTS "round_freeze"();
DROP TABLE IF EXISTS "progress_event";
DROP TABLE IF EXISTS "response";
DROP TABLE IF EXISTS "round_client";
DROP TABLE IF EXISTS "round";
DROP TABLE IF EXISTS "client";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014120000_rounds_responses';
