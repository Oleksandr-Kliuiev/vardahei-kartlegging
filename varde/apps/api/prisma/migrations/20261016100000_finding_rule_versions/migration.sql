-- 2.5: versioned FindingRule editing. A version records when it was made and never changes; the
-- findings of a release are computed once (finding_set) and their rows never change.

-- AlterTable
ALTER TABLE "finding_rule" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "finding_set" (
    "release_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "round_id" UUID NOT NULL,
    "rule_keys" TEXT[],
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_set_pkey" PRIMARY KEY ("release_id","scope")
);

-- CreateIndex
CREATE INDEX "finding_set_round_id_idx" ON "finding_set"("round_id");

-- Current releases of closed rounds were computed with the versions that existed before 2.5; where a
-- release already has rows, the smallest version per rule counts (as the client report reads them).
-- Only the rules of the round's template family (as FindingsService.released() and the archive).
INSERT INTO "finding_set" ("release_id", "scope", "round_id", "rule_keys")
SELECT s."release_id", s."scope", s."round_id",
  ARRAY(
    SELECT e."rule_key" FROM (
      SELECT k."key" || '@' || COALESCE(
        (SELECT min(f."rule_version") FROM "finding" f
          WHERE f."release_id" = s."release_id" AND f."rule_key" = k."key"
            AND COALESCE(f."client_id"::text, 'all') = s."scope"),
        k."first") AS "rule_key"
      FROM (
        SELECT "key", min("version") AS "first" FROM "finding_rule"
        WHERE starts_with("key", s."family" || '.') GROUP BY "key"
      ) k
    ) e
    -- Byte order, as FindingsService.released() sorts its keys.
    ORDER BY e."rule_key" COLLATE "C"
  )
FROM (
  SELECT DISTINCT a."release_id", COALESCE(a."client_id"::text, 'all') AS "scope", a."round_id",
    t."key" AS "family"
  FROM "aggregate_snapshot" a
  JOIN "round" r ON r."id" = a."round_id"
  JOIN "template_version" v ON v."id" = r."template_version_id"
  JOIN "survey_template" t ON t."id" = v."template_id"
  WHERE a."status" = 'released' AND a."population" IN ('all_clients', 'round_client')
    AND r."status" IN ('closed', 'archived')
) s
WHERE EXISTS (SELECT 1 FROM "finding_rule" WHERE starts_with("key", s."family" || '.'));

CREATE FUNCTION "finding_rule_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'finding_rule_immutable: % version % never changes; save a new version', OLD."key", OLD."version"
    USING ERRCODE = 'restrict_violation';
END
$$;
CREATE TRIGGER "finding_rule_immutable" BEFORE UPDATE OR DELETE ON "finding_rule"
  FOR EACH ROW EXECUTE FUNCTION "finding_rule_immutable"();

CREATE FUNCTION "finding_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'finding_immutable: a row of % is written once and never changes', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;
CREATE TRIGGER "finding_immutable" BEFORE UPDATE ON "finding"
  FOR EACH ROW EXECUTE FUNCTION "finding_immutable"();
CREATE TRIGGER "finding_set_immutable" BEFORE UPDATE ON "finding_set"
  FOR EACH ROW EXECUTE FUNCTION "finding_immutable"();
