-- Wave A of the admin workflow (decision of Oleksandr 09.11): clients carry free tags, so a campaign
-- can tell its cohorts apart («IT», «BIO») in the lists and when clients are picked for a round, a
-- seminar or a round of conversations; and Vardahei may enter a client's contact person itself
-- instead of waiting for that person to fill in a seminar form.
--
-- `contact.kept_by_admin` marks a contact Vardahei entered: it is kept on the relationship with the
-- client (ADR-017 class `contact`, kind `relationship`), not on a consent, so the daily job must not
-- take it for an unused leftover. The yearly check still marks it, and it is deleted on request like
-- any other contact. Consent to invitations is untouched by this: only the person gives that.

-- AlterTable
ALTER TABLE "client" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "contact" ADD COLUMN     "kept_by_admin" BOOLEAN NOT NULL DEFAULT false;
