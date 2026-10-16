-- Down migration for 20261016140000_live_poll (hand-written; test databases and rollback only:
-- the question states of live polls and the presenter keys are dropped. Live rounds and their
-- answers stay; the technical client «Seminar (live)» is an ordinary client row until the
-- migration is applied again, which makes it the technical client again by its slug).
DROP TRIGGER IF EXISTS "seminar_round_live_type" ON "seminar";
DROP FUNCTION IF EXISTS "seminar_round_live_type"();
DROP TRIGGER IF EXISTS "round_client_live" ON "round_client";
DROP FUNCTION IF EXISTS "round_client_live"();
DROP TRIGGER IF EXISTS "round_type_fixed" ON "round";
DROP FUNCTION IF EXISTS "round_type_fixed"();
DROP TRIGGER IF EXISTS "client_kind_fixed" ON "client";
DROP FUNCTION IF EXISTS "client_kind_fixed"();
DROP INDEX IF EXISTS "seminar_round_live_once";
DROP TABLE IF EXISTS "presenter_token";
DROP TABLE IF EXISTS "live_poll_question";
DROP FUNCTION IF EXISTS "live_poll_question_step"();
DROP INDEX IF EXISTS "client_one_seminar";
ALTER TABLE "client" DROP CONSTRAINT IF EXISTS "client_kind_check";
ALTER TABLE "client" DROP COLUMN IF EXISTS "kind";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261016140000_live_poll';
