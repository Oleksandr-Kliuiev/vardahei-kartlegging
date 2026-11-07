-- 2.22b Samtalar: actions of the catalogue (`action`, 3.1) chosen under «Konklusjon og tiltak» of one
-- answer, and their follow-up as for findings: open, taken up at a seminar (open with `seminar_id`) or
-- closed, with who changed it and when. Data class samtale: the rows go with the answer, so with the
-- conversation (forget by client, the ledger). A deleted seminar sets `seminar_id` to NULL: what it took
-- up is open again and what was closed in it stays closed, as seminars.service does for findings.
-- CreateTable
CREATE TABLE "interview_action" (
    "interview_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "action_id" UUID NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "seminar_id" UUID,
    "changed_by" TEXT,
    "changed_at" TIMESTAMPTZ(6),

    CONSTRAINT "interview_action_pkey" PRIMARY KEY ("interview_id","question_id","action_id")
);

-- AddForeignKey
ALTER TABLE "interview_action" ADD CONSTRAINT "interview_action_interview_id_question_id_fkey" FOREIGN KEY ("interview_id", "question_id") REFERENCES "interview_answer"("interview_id", "question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_action" ADD CONSTRAINT "interview_action_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "action"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_action" ADD CONSTRAINT "interview_action_seminar_id_fkey" FOREIGN KEY ("seminar_id") REFERENCES "seminar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Check: a status that was changed says by whom and when; a fresh choice has neither.
ALTER TABLE "interview_action" ADD CONSTRAINT "interview_action_changed_check"
  CHECK (("changed_by" IS NULL) = ("changed_at" IS NULL));
