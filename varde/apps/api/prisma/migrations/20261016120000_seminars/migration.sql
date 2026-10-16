-- 3.1: seminars, their clients, contacts and registrations (personal data, ADR-017), actions,
-- the FindingRule → Action link by rule key, the working status of findings and the hash
-- history of replaced seminar links.

-- CreateTable
CREATE TABLE "seminar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_nn" TEXT NOT NULL,
    "topic_en" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "place" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "required_languages" TEXT[],
    "code" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "round_before_id" UUID,
    "round_live_id" UUID,
    "round_after_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "seminar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_seminar_code" (
    "code_hash" TEXT NOT NULL,
    "seminar_id" UUID NOT NULL,
    "revoked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_seminar_code_pkey" PRIMARY KEY ("code_hash")
);

-- CreateTable
CREATE TABLE "seminar_client" (
    "seminar_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,

    CONSTRAINT "seminar_client_pkey" PRIMARY KEY ("seminar_id","client_id")
);

-- CreateTable
CREATE TABLE "contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "client_id" UUID,
    "company" TEXT NOT NULL,
    "role_at_client" TEXT,
    "consent_version" TEXT NOT NULL,
    "consent_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_flagged_at" TIMESTAMPTZ(6),

    CONSTRAINT "contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seminar_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "lang" TEXT NOT NULL,
    "consent_version" TEXT NOT NULL,
    "consent_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_tombstone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "registrations" INTEGER NOT NULL,

    CONSTRAINT "participant_tombstone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "seminar_topic" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_rule_action" (
    "rule_key" TEXT NOT NULL,
    "action_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by" TEXT NOT NULL,

    CONSTRAINT "finding_rule_action_pkey" PRIMARY KEY ("rule_key")
);

-- CreateTable
CREATE TABLE "finding_status" (
    "finding_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "seminar_id" UUID,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_status_pkey" PRIMARY KEY ("finding_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seminar_code_hash_key" ON "seminar"("code_hash");

-- CreateIndex
CREATE INDEX "seminar_ends_at_idx" ON "seminar"("ends_at");

-- CreateIndex
CREATE INDEX "revoked_seminar_code_seminar_id_idx" ON "revoked_seminar_code"("seminar_id");

-- CreateIndex
CREATE INDEX "seminar_client_client_id_idx" ON "seminar_client"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_email_key" ON "contact"("email");

-- CreateIndex
CREATE INDEX "contact_review_flagged_at_idx" ON "contact"("review_flagged_at");

-- CreateIndex
CREATE INDEX "registration_contact_id_idx" ON "registration"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "registration_seminar_id_contact_id_key" ON "registration"("seminar_id", "contact_id");

-- CreateIndex
CREATE INDEX "participant_tombstone_contact_id_idx" ON "participant_tombstone"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "action_name_key" ON "action"("name");

-- CreateIndex
CREATE INDEX "finding_rule_action_action_id_idx" ON "finding_rule_action"("action_id");

-- CreateIndex
CREATE INDEX "finding_status_seminar_id_idx" ON "finding_status"("seminar_id");

-- AddForeignKey
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_round_before_id_fkey" FOREIGN KEY ("round_before_id") REFERENCES "round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_round_live_id_fkey" FOREIGN KEY ("round_live_id") REFERENCES "round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_round_after_id_fkey" FOREIGN KEY ("round_after_id") REFERENCES "round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revoked_seminar_code" ADD CONSTRAINT "revoked_seminar_code_seminar_id_fkey" FOREIGN KEY ("seminar_id") REFERENCES "seminar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seminar_client" ADD CONSTRAINT "seminar_client_seminar_id_fkey" FOREIGN KEY ("seminar_id") REFERENCES "seminar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seminar_client" ADD CONSTRAINT "seminar_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact" ADD CONSTRAINT "contact_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration" ADD CONSTRAINT "registration_seminar_id_fkey" FOREIGN KEY ("seminar_id") REFERENCES "seminar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration" ADD CONSTRAINT "registration_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_tombstone" ADD CONSTRAINT "participant_tombstone_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "deletion_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_rule_action" ADD CONSTRAINT "finding_rule_action_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "action"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_status" ADD CONSTRAINT "finding_status_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_status" ADD CONSTRAINT "finding_status_seminar_id_fkey" FOREIGN KEY ("seminar_id") REFERENCES "seminar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: CHECKs (3.1). Times are instants; the page shows them in Europe/Oslo.
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_format_check" CHECK ("format" IN ('onsite', 'digital'));
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_times_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_languages_check"
  CHECK ("required_languages" IS NOT NULL AND 'nn' = ANY ("required_languages")
    AND "required_languages" <@ ARRAY['nn', 'en']::text[]);
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_topic_check"
  CHECK (btrim("topic_nn") <> '' AND btrim("place") <> ''
    AND (NOT ('en' = ANY ("required_languages")) OR btrim(coalesce("topic_en", '')) <> ''));
-- ADR-009: 128-bit bearer, base64url, 22 characters.
ALTER TABLE "seminar" ADD CONSTRAINT "seminar_code_check" CHECK ("code" ~ '^[A-Za-z0-9_-]{22}$');
ALTER TABLE "contact" ADD CONSTRAINT "contact_email_check"
  CHECK ("email" = lower(btrim("email")) AND "email" LIKE '_%@_%');
ALTER TABLE "contact" ADD CONSTRAINT "contact_text_check"
  CHECK (btrim("name") <> '' AND btrim("company") <> '');
ALTER TABLE "registration" ADD CONSTRAINT "registration_lang_check" CHECK ("lang" IN ('nn', 'en'));
ALTER TABLE "finding_status" ADD CONSTRAINT "finding_status_status_check"
  CHECK ("status" IN ('open', 'in_seminar', 'closed'));
ALTER TABLE "finding_status" ADD CONSTRAINT "finding_status_seminar_check"
  CHECK (("status" <> 'in_seminar' OR "seminar_id" IS NOT NULL) AND ("status" <> 'open' OR "seminar_id" IS NULL));
-- Deletion on request gains the scope `participant` (a seminar contact by e-mail).
ALTER TABLE "deletion_request" DROP CONSTRAINT "deletion_request_scope_check";
ALTER TABLE "deletion_request" ADD CONSTRAINT "deletion_request_scope_check"
  CHECK ("scope" IN ('client', 'respondent', 'submissions', 'participant'));
