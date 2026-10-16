-- 3.3: material of a seminar (title and link, no uploads); the seminar page shows it after
-- the seminar.

-- CreateTable
CREATE TABLE "seminar_material" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seminar_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "seminar_material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seminar_material_seminar_id_idx" ON "seminar_material"("seminar_id");

-- AddForeignKey
ALTER TABLE "seminar_material" ADD CONSTRAINT "seminar_material_seminar_id_fkey" FOREIGN KEY ("seminar_id") REFERENCES "seminar"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: a title and an http(s) link only.
ALTER TABLE "seminar_material" ADD CONSTRAINT "seminar_material_check"
  CHECK (btrim("title") <> '' AND "url" ~ '^https?://[^\s]+$');
