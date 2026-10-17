-- Settings of the admin and what each language was approved on (2.16). Generated with
-- `prisma migrate diff --from-migrations … --to-schema-datamodel …`; comments by hand.

-- The texts of each language at its last approval: the workshop says what changed since. Existing
-- rows get '{}' (no snapshot); a published version is never updated (template_version_immutable).
-- AlterTable
ALTER TABLE "template_version" ADD COLUMN     "acceptance_basis" JSONB NOT NULL DEFAULT '{}';

-- Defaults new surveys take (contact, sender, opening hours), by key.
-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);
