-- Down migration for 20261018100000_sent_marks_and_comments (hand-written; test databases and
-- rollback only): the notes and the sent marks go; rounds and surveys are untouched.
DROP TABLE IF EXISTS "question_comment";
ALTER TABLE "round_client" DROP COLUMN IF EXISTS "invitation_sent_at", DROP COLUMN IF EXISTS "invitation_sent_by", DROP COLUMN IF EXISTS "reminder_sent_at", DROP COLUMN IF EXISTS "reminder_sent_by", DROP COLUMN IF EXISTS "report_sent_at", DROP COLUMN IF EXISTS "report_sent_by";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261018100000_sent_marks_and_comments';
