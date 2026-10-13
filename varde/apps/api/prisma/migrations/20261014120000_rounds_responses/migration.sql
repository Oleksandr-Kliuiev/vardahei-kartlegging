-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "employee_count" INTEGER,
    "default_lang" TEXT NOT NULL DEFAULT 'nn',
    "atlas_external_id" TEXT,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "template_version_id" UUID,
    "identification" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_client" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" TEXT,
    "code_hash" TEXT,
    "code_expires_at" TIMESTAMPTZ(6),
    "code_revoked_at" TIMESTAMPTZ(6),
    "legacy_code_hash" TEXT,
    "population_snapshot" INTEGER,
    "deadline" DATE,
    "status" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "round_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_client_id" UUID NOT NULL,
    "part" TEXT NOT NULL,
    "role" TEXT,
    "lang" TEXT NOT NULL,
    "respondent_key" TEXT,
    "answers" JSONB NOT NULL,
    "free" JSONB NOT NULL DEFAULT '{}',
    "submission_id" UUID NOT NULL,
    "content_hash" TEXT NOT NULL,
    "source_id" TEXT,
    "duration_s" INTEGER,
    "submitted_day" DATE NOT NULL,

    CONSTRAINT "response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_client_id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_no" INTEGER NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_slug_key" ON "client"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "round_client_code_hash_key" ON "round_client"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "round_client_round_id_client_id_key" ON "round_client"("round_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "response_submission_id_key" ON "response"("submission_id");

-- CreateIndex
CREATE INDEX "response_round_client_id_part_idx" ON "response"("round_client_id", "part");

-- CreateIndex
CREATE UNIQUE INDEX "response_source_id_part_key" ON "response"("source_id", "part");

-- CreateIndex
CREATE INDEX "progress_event_round_client_id_at_idx" ON "progress_event"("round_client_id", "at");

-- AddForeignKey
ALTER TABLE "round" ADD CONSTRAINT "round_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "template_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_client" ADD CONSTRAINT "round_client_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_client" ADD CONSTRAINT "round_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response" ADD CONSTRAINT "response_round_client_id_fkey" FOREIGN KEY ("round_client_id") REFERENCES "round_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_event" ADD CONSTRAINT "progress_event_round_client_id_fkey" FOREIGN KEY ("round_client_id") REFERENCES "round_client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: CHECKs (Prisma does not model them), mode rules of ADR-022/ADR-025.
ALTER TABLE "round" ADD CONSTRAINT "round_type_check"
  CHECK ("type" IN ('regular', 'post_seminar', 'live', 'external_import'));
ALTER TABLE "round" ADD CONSTRAINT "round_status_check"
  CHECK ("status" IN ('draft', 'open', 'closed', 'archived'));
ALTER TABLE "round" ADD CONSTRAINT "round_identification_check"
  CHECK ("identification" IS NULL OR "identification" IN ('initials', 'none'));
ALTER TABLE "round" ADD CONSTRAINT "round_mode_fixed"
  CHECK ("status" = 'draft' OR ("template_version_id" IS NOT NULL AND "identification" IS NOT NULL));
ALTER TABLE "round_client" ADD CONSTRAINT "round_client_status_check"
  CHECK ("status" IN ('draft', 'open', 'closed', 'archived'));
ALTER TABLE "response" ADD CONSTRAINT "response_part_check" CHECK ("part" IN ('common', 'leader'));
ALTER TABLE "response" ADD CONSTRAINT "response_lang_check" CHECK ("lang" IN ('nn', 'en', 'nb'));
ALTER TABLE "response" ADD CONSTRAINT "response_respondent_key_check"
  CHECK ("respondent_key" IS NULL OR ("respondent_key" = upper("respondent_key") AND length("respondent_key") BETWEEN 1 AND 8));

-- template_version and identification do not change once the round has left draft (ADR-022).
CREATE FUNCTION "round_freeze"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'draft' AND (
    NEW."template_version_id" IS DISTINCT FROM OLD."template_version_id"
    OR NEW."identification" IS DISTINCT FROM OLD."identification"
  ) THEN
    RAISE EXCEPTION 'round_freeze: template_version and identification of round % are fixed', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "round_freeze" BEFORE UPDATE ON "round" FOR EACH ROW EXECUTE FUNCTION "round_freeze"();

-- respondent_key only in rounds with identification = initials (NULL identification included).
CREATE FUNCTION "response_respondent_key_mode"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mode TEXT;
BEGIN
  IF NEW."respondent_key" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT r."identification" INTO mode
    FROM "round_client" rc JOIN "round" r ON r."id" = rc."round_id"
   WHERE rc."id" = NEW."round_client_id";
  IF mode IS DISTINCT FROM 'initials' THEN
    RAISE EXCEPTION 'response_respondent_key_mode: respondent_key in a round without initials'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "response_respondent_key_mode" BEFORE INSERT OR UPDATE ON "response"
  FOR EACH ROW EXECUTE FUNCTION "response_respondent_key_mode"();
