-- Down migration for 20261111120000_survey_delete (hand-written; test databases and rollback only):
-- a published version can never be deleted again.
CREATE OR REPLACE FUNCTION "template_version_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
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
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261111120000_survey_delete';
