-- CreateTable
CREATE TABLE "metric_definition" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,

    CONSTRAINT "metric_definition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregate_snapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "population" TEXT NOT NULL,
    "round_client_id" UUID,
    "client_id" UUID,
    "metric_key" TEXT NOT NULL,
    "metric_version" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "numerator" DOUBLE PRECISION NOT NULL,
    "denominator" DOUBLE PRECISION NOT NULL,
    "missing" INTEGER NOT NULL,
    "suppressed" BOOLEAN NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "computed_at" DATE NOT NULL,
    "released_at" DATE,
    "superseded_at" TIMESTAMPTZ(6),
    "superseded_reason" TEXT,
    "release_id" UUID NOT NULL,

    CONSTRAINT "aggregate_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_metric_set" (
    "round_id" UUID NOT NULL,
    "metric_keys" TEXT[],
    "fixed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_metric_set_pkey" PRIMARY KEY ("round_id")
);

-- CreateTable
CREATE TABLE "finding_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "definition" JSONB NOT NULL,

    CONSTRAINT "finding_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "client_id" UUID,
    "rule_key" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "numbers" JSONB NOT NULL,
    "release_id" UUID NOT NULL,

    CONSTRAINT "finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_manifest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "round_ids" TEXT[],
    "counts" JSONB NOT NULL,
    "rejected" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "started_by" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_manifest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_request" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requested_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_ref" JSONB NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_tombstone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "content_hash" TEXT NOT NULL,
    "round_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "part" TEXT NOT NULL,
    "source_id" TEXT,
    "respondent_key" TEXT,

    CONSTRAINT "deletion_tombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metric_definition_key_version_key" ON "metric_definition"("key", "version");

-- CreateIndex
CREATE INDEX "aggregate_snapshot_round_id_population_status_idx" ON "aggregate_snapshot"("round_id", "population", "status");

-- CreateIndex
CREATE INDEX "aggregate_snapshot_release_id_idx" ON "aggregate_snapshot"("release_id");

-- CreateIndex
CREATE UNIQUE INDEX "finding_rule_key_version_key" ON "finding_rule"("key", "version");

-- CreateIndex
CREATE INDEX "finding_round_id_idx" ON "finding"("round_id");

-- CreateIndex
CREATE INDEX "deletion_tombstone_source_id_part_idx" ON "deletion_tombstone"("source_id", "part");

-- CreateIndex
CREATE INDEX "deletion_tombstone_submission_id_idx" ON "deletion_tombstone"("submission_id");

-- AddForeignKey
ALTER TABLE "deletion_tombstone" ADD CONSTRAINT "deletion_tombstone_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "deletion_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: CHECKs and the immutability of released snapshots (ADR-021).
ALTER TABLE "aggregate_snapshot" ADD CONSTRAINT "aggregate_snapshot_population_check"
  CHECK ("population" IN ('round_client', 'all_clients', 'leaders_all'));
ALTER TABLE "aggregate_snapshot" ADD CONSTRAINT "aggregate_snapshot_status_check"
  CHECK ("status" IN ('computed', 'released', 'superseded'));
ALTER TABLE "aggregate_snapshot" ADD CONSTRAINT "aggregate_snapshot_superseded_check"
  CHECK ("status" <> 'superseded' OR ("superseded_reason" IS NOT NULL AND btrim("superseded_reason") <> ''));
ALTER TABLE "finding_rule" ADD CONSTRAINT "finding_rule_channel_check" CHECK ("channel" IN ('aggregate', 'leader'));
ALTER TABLE "import_manifest" ADD CONSTRAINT "import_manifest_source_check" CHECK ("source" IN ('svar', 'runde1'));
ALTER TABLE "import_manifest" ADD CONSTRAINT "import_manifest_status_check" CHECK ("status" IN ('ok', 'failed'));
ALTER TABLE "deletion_request" ADD CONSTRAINT "deletion_request_scope_check"
  CHECK ("scope" IN ('client', 'respondent', 'submissions'));
ALTER TABLE "deletion_tombstone" ADD CONSTRAINT "deletion_tombstone_part_check" CHECK ("part" IN ('common', 'leader'));

CREATE FUNCTION "aggregate_snapshot_released"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  volatile CONSTANT TEXT[] := ARRAY['status', 'superseded_at', 'superseded_reason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('released', 'superseded') THEN
      RAISE EXCEPTION 'aggregate_snapshot_released: a released snapshot is never deleted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'superseded' THEN
    RAISE EXCEPTION 'aggregate_snapshot_released: a superseded snapshot does not change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" = 'released' AND (
    NEW."status" <> 'superseded'
    OR NEW."superseded_reason" IS NULL OR btrim(NEW."superseded_reason") = ''
    OR (to_jsonb(NEW) - volatile) IS DISTINCT FROM (to_jsonb(OLD) - volatile)
  ) THEN
    RAISE EXCEPTION 'aggregate_snapshot_released: released → superseded with a reason is the only change'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "aggregate_snapshot_released" BEFORE UPDATE OR DELETE ON "aggregate_snapshot"
  FOR EACH ROW EXECUTE FUNCTION "aggregate_snapshot_released"();
