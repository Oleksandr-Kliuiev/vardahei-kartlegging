-- Rounds before and after a seminar (3.8). Hand-written: the columns `round_before_id` and
-- `round_after_id` came with 20261016120000_seminars; Prisma models neither triggers nor partial
-- indexes. The API refuses the same with a message (seminars/seminar-rounds.service.ts).

-- «Før» is an ordinary survey of the clients (type regular), «Etter» a survey after the seminar
-- (type post_seminar). The type of a round never changes (round_type_fixed, 3.4).
CREATE FUNCTION "seminar_round_before_after_type"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."round_before_id" IS NOT NULL
     AND (SELECT r."type" FROM "round" r WHERE r."id" = NEW."round_before_id") IS DISTINCT FROM 'regular' THEN
    RAISE EXCEPTION 'seminar_round_before_type: the round before seminar % is not a regular round', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."round_after_id" IS NOT NULL
     AND (SELECT r."type" FROM "round" r WHERE r."id" = NEW."round_after_id") IS DISTINCT FROM 'post_seminar' THEN
    RAISE EXCEPTION 'seminar_round_after_type: the round after seminar % is not a post_seminar round', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "seminar_round_before_after_type"
  BEFORE INSERT OR UPDATE OF "round_before_id", "round_after_id" ON "seminar"
  FOR EACH ROW EXECUTE FUNCTION "seminar_round_before_after_type"();

-- A survey after a seminar belongs to that one seminar; one round may be «Før» of several.
CREATE UNIQUE INDEX "seminar_round_after_once" ON "seminar" ("round_after_id")
  WHERE "round_after_id" IS NOT NULL;
