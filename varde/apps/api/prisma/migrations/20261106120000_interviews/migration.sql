-- 2.20 Samtalar: conversations with key people that Vardahei fills in at the client's table.
-- A guide is a survey template of audience 'interview'; a round of conversations names one published
-- guide; one conversation per client and round; answers are saved field by field (data class samtale).
-- CreateTable
CREATE TABLE "interview_round" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "template_version_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "interview_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "interview_round_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "held_on" DATE,
    "interviewees" JSONB NOT NULL DEFAULT '[]',
    "interviewers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT NOT NULL DEFAULT '',
    "agreed" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "started_at" TIMESTAMPTZ(6),
    "done_at" TIMESTAMPTZ(6),
    "done_by" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answer" (
    "interview_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "rating" TEXT,
    "action" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "interview_answer_pkey" PRIMARY KEY ("interview_id","question_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_round_name_key" ON "interview_round"("name");

-- CreateIndex
CREATE INDEX "interview_client_id_idx" ON "interview"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_interview_round_id_client_id_key" ON "interview"("interview_round_id", "client_id");

-- AddForeignKey
ALTER TABLE "interview_round" ADD CONSTRAINT "interview_round_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_interview_round_id_fkey" FOREIGN KEY ("interview_round_id") REFERENCES "interview_round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answer" ADD CONSTRAINT "interview_answer_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Checks: the new audience, the states and the rating scale (decision 2 of 06.11).
ALTER TABLE "survey_template" DROP CONSTRAINT "survey_template_audience_check";
ALTER TABLE "survey_template" ADD CONSTRAINT "survey_template_audience_check"
  CHECK ("audience" IN ('client_survey', 'seminar_live', 'seminar_after', 'interview'));
ALTER TABLE "interview_round" ADD CONSTRAINT "interview_round_status_check"
  CHECK ("status" IN ('open', 'closed'));
ALTER TABLE "interview" ADD CONSTRAINT "interview_status_check"
  CHECK ("status" IN ('planned', 'in_progress', 'done'));
ALTER TABLE "interview" ADD CONSTRAINT "interview_done_check"
  CHECK (("status" = 'done') = ("done_at" IS NOT NULL));
ALTER TABLE "interview" ADD CONSTRAINT "interview_interviewees_check"
  CHECK (jsonb_typeof("interviewees") = 'array');
ALTER TABLE "interview_answer" ADD CONSTRAINT "interview_answer_rating_check"
  CHECK ("rating" IS NULL OR "rating" IN ('ivaretatt', 'forbetring', 'manglar', 'ikkje_aktuelt'));
