-- Down migration for 20261107120000_interview_actions (hand-written; test databases and rollback only):
-- the chosen actions and their follow-up go; the conversations, the catalogue and the seminars stay.
DROP TABLE IF EXISTS "interview_action";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107120000_interview_actions';
