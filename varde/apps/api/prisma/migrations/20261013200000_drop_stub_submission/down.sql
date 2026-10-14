-- Down migration for 20261013200000_drop_stub_submission: recreates the table as
-- 20261013160000_stub_submission/migration.sql did.
CREATE TABLE "stub_submission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stub_submission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stub_submission_submission_id_key" ON "stub_submission"("submission_id");
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261013200000_drop_stub_submission';
