-- CreateTable
CREATE TABLE "survey_template" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "required_languages" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_version" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "identification" TEXT NOT NULL DEFAULT 'initials',
    "required_languages" TEXT[],
    "content" JSONB NOT NULL,
    "translation_acceptance" JSONB NOT NULL DEFAULT '{}',
    "origin" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "published_by" TEXT,

    CONSTRAINT "template_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "survey_template_key_key" ON "survey_template"("key");

-- CreateIndex
CREATE UNIQUE INDEX "template_version_template_id_version_no_key" ON "template_version"("template_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "template_version_template_id_label_key" ON "template_version"("template_id", "label");

-- AddForeignKey
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "survey_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: CHECKs (Prisma does not model them) and the immutability of published versions.
ALTER TABLE "survey_template" ADD CONSTRAINT "survey_template_audience_check"
  CHECK ("audience" IN ('client_survey', 'seminar_live', 'seminar_after'));
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_status_check"
  CHECK ("status" IN ('draft', 'published'));
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_identification_check"
  CHECK ("identification" IN ('initials', 'none'));
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_origin_check"
  CHECK ("origin" IN ('authored', 'kartlegging', 'external_import'));
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_published_check"
  CHECK ("status" = 'draft' OR "published_at" IS NOT NULL);

CREATE FUNCTION "template_version_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'published' THEN
    RAISE EXCEPTION 'template_version_immutable: version % is published', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "template_version_immutable" BEFORE UPDATE OR DELETE ON "template_version"
  FOR EACH ROW EXECUTE FUNCTION "template_version_immutable"();
