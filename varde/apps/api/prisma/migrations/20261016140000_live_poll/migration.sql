-- 3.4: seminar live poll (states of its questions) and the presenter key of a seminar; the one
-- technical client that holds the RoundClient of every live round (ADR-022: one per seminar).

-- AlterTable
ALTER TABLE "client" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'client';

-- CreateTable
CREATE TABLE "live_poll_question" (
    "round_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "released_at" TIMESTAMPTZ(6),
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_poll_question_pkey" PRIMARY KEY ("round_id","question_id")
);

-- CreateTable
CREATE TABLE "presenter_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seminar_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" TEXT,

    CONSTRAINT "presenter_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_poll_question_round_id_position_key" ON "live_poll_question"("round_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "presenter_token_token_hash_key" ON "presenter_token"("token_hash");

-- CreateIndex
CREATE INDEX "presenter_token_seminar_id_idx" ON "presenter_token"("seminar_id");

-- AddForeignKey
ALTER TABLE "live_poll_question" ADD CONSTRAINT "live_poll_question_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presenter_token" ADD CONSTRAINT "presenter_token_seminar_id_fkey" FOREIGN KEY ("seminar_id") REFERENCES "seminar"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: CHECKs, partial unique indexes and triggers (Prisma models none of them).
ALTER TABLE "client" ADD CONSTRAINT "client_kind_check" CHECK ("kind" IN ('client', 'seminar'));
CREATE UNIQUE INDEX "client_one_seminar" ON "client" ("kind") WHERE "kind" = 'seminar';
ALTER TABLE "live_poll_question" ADD CONSTRAINT "live_poll_question_state_check"
  CHECK ("state" IN ('waiting', 'open', 'closed', 'released'));
ALTER TABLE "live_poll_question" ADD CONSTRAINT "live_poll_question_position_check"
  CHECK ("position" >= 1);
CREATE UNIQUE INDEX "live_poll_question_one_open" ON "live_poll_question" ("round_id")
  WHERE "state" = 'open';
ALTER TABLE "presenter_token" ADD CONSTRAINT "presenter_token_hash_check"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "presenter_token" ADD CONSTRAINT "presenter_token_revoked_check"
  CHECK (("revoked_at" IS NULL) = ("revoked_by" IS NULL));
CREATE UNIQUE INDEX "presenter_token_one_active" ON "presenter_token" ("seminar_id")
  WHERE "revoked_at" IS NULL;
CREATE UNIQUE INDEX "seminar_round_live_once" ON "seminar" ("round_live_id")
  WHERE "round_live_id" IS NOT NULL;

-- The kind of a client and the type of a round never change: the rule below rests on them.
CREATE FUNCTION "client_kind_fixed"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" <> OLD."kind" THEN
    RAISE EXCEPTION 'client_kind_fixed: the kind of client % is fixed', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "client_kind_fixed" BEFORE UPDATE OF "kind" ON "client"
  FOR EACH ROW EXECUTE FUNCTION "client_kind_fixed"();

CREATE FUNCTION "round_type_fixed"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" <> OLD."type" THEN
    RAISE EXCEPTION 'round_type_fixed: the type of round % is fixed', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "round_type_fixed" BEFORE UPDATE OF "type" ON "round"
  FOR EACH ROW EXECUTE FUNCTION "round_type_fixed"();

-- A RoundClient has the technical seminar client exactly when its round is a live poll: live
-- answers are never filed under a company, and a client survey never under the seminar.
CREATE FUNCTION "round_client_live"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  is_live BOOLEAN;
  is_seminar BOOLEAN;
BEGIN
  SELECT r."type" = 'live' INTO is_live FROM "round" r WHERE r."id" = NEW."round_id";
  SELECT c."kind" = 'seminar' INTO is_seminar FROM "client" c WHERE c."id" = NEW."client_id";
  IF is_live IS DISTINCT FROM is_seminar THEN
    RAISE EXCEPTION 'round_client_live: only a live round has the seminar client, and it has no other'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "round_client_live" BEFORE INSERT OR UPDATE OF "round_id", "client_id" ON "round_client"
  FOR EACH ROW EXECUTE FUNCTION "round_client_live"();

-- The live round of a seminar is a round of type live.
CREATE FUNCTION "seminar_round_live_type"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."round_live_id" IS NOT NULL
     AND (SELECT r."type" FROM "round" r WHERE r."id" = NEW."round_live_id") IS DISTINCT FROM 'live' THEN
    RAISE EXCEPTION 'seminar_round_live_type: the live round of seminar % is not a live round', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "seminar_round_live_type" BEFORE INSERT OR UPDATE OF "round_live_id" ON "seminar"
  FOR EACH ROW EXECUTE FUNCTION "seminar_round_live_type"();

-- The server leads the states (3.4): a question starts waiting; waiting → open → closed → released,
-- and closed → open again until it is shown. Released is final. Identity columns never change.
CREATE FUNCTION "live_poll_question_step"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."state" <> 'waiting' THEN
      RAISE EXCEPTION 'live_poll_question_step: question % starts waiting', NEW."question_id"
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."round_id" <> OLD."round_id" OR NEW."question_id" <> OLD."question_id"
     OR NEW."position" <> OLD."position" THEN
    RAISE EXCEPTION 'live_poll_question_step: question % of round % keeps its place', OLD."question_id", OLD."round_id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."state" <> OLD."state" AND NOT (
       (OLD."state" = 'waiting' AND NEW."state" = 'open')
    OR (OLD."state" = 'open' AND NEW."state" = 'closed')
    OR (OLD."state" = 'closed' AND NEW."state" IN ('open', 'released'))
  ) THEN
    RAISE EXCEPTION 'live_poll_question_step: % → % is not a step (question % of round %)',
      OLD."state", NEW."state", OLD."question_id", OLD."round_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "live_poll_question_step" BEFORE INSERT OR UPDATE ON "live_poll_question"
  FOR EACH ROW EXECUTE FUNCTION "live_poll_question_step"();
