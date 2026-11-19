-- A survey nobody uses can be deleted whole, published versions too (11.11, asked for by Oleksandr: a
-- guide replaced by a new one from a Word file stayed in the library and in the pickers for good).
-- A published version still never changes and never goes by accident: the trigger lets a DELETE through
-- only inside a transaction that has said so with SET LOCAL varde.slett_skjema = 'on', which only
-- EditorService.remove does, after it has checked that no round or conversation round uses the survey.
-- coalesce: an unset setting reads as NULL, and NOT (… AND NULL) is NULL, which IF takes as false.
CREATE OR REPLACE FUNCTION "template_version_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'published'
     AND NOT (TG_OP = 'DELETE' AND coalesce(current_setting('varde.slett_skjema', true), '') = 'on') THEN
    RAISE EXCEPTION 'template_version_immutable: version % is published', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
