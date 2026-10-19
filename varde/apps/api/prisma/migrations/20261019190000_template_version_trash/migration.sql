-- Papirkorg for utkast (2.19): a deleted draft is kept with the time and who deleted it, hidden from the
-- library, and can be restored or removed for good. Published versions are never marked
-- (template_version_immutable stays).
-- AlterTable
ALTER TABLE "template_version" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "deleted_by" TEXT;

-- Only a draft can be in the trash.
ALTER TABLE "template_version" ADD CONSTRAINT "template_version_trash_only_draft"
  CHECK ("deleted_at" IS NULL OR "status" = 'draft');
