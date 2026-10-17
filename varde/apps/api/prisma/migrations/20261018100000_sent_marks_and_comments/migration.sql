-- 2.18: what went out by hand (invitation, reminder, report) with when and by whom, and notes on
-- questions in the workshop. Varde itself sends nothing.
-- AlterTable
ALTER TABLE "round_client" ADD COLUMN     "invitation_sent_at" TIMESTAMPTZ(6),
ADD COLUMN     "invitation_sent_by" TEXT,
ADD COLUMN     "reminder_sent_at" TIMESTAMPTZ(6),
ADD COLUMN     "reminder_sent_by" TEXT,
ADD COLUMN     "report_sent_at" TIMESTAMPTZ(6),
ADD COLUMN     "report_sent_by" TEXT;

-- CreateTable
CREATE TABLE "question_comment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "template_version_id" UUID NOT NULL,
    "node" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" TEXT,

    CONSTRAINT "question_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_comment_template_id_idx" ON "question_comment"("template_id");

-- AddForeignKey
ALTER TABLE "question_comment" ADD CONSTRAINT "question_comment_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "survey_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_comment" ADD CONSTRAINT "question_comment_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

