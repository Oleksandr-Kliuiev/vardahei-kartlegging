-- Wave B of the admin workflow: a client may be archived. A client with a round, a seminar or a
-- conversation can never be deleted (answers and history would go with it), so a duplicate or a
-- client Vardahei no longer works with has had nowhere to go but the list. Archived it keeps
-- everything it has and stays out of the lists and the pickers until it is taken back.

-- AlterTable
ALTER TABLE "client" ADD COLUMN     "archived_at" TIMESTAMPTZ(6);
