-- CreateTable
CREATE TABLE "admin_session" (
    "sid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "oid" TEXT,
    "name" TEXT,
    "via" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "admin_session_expires_at_idx" ON "admin_session"("expires_at");


-- Hand-written: Prisma does not model CHECK constraints.
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_via_check" CHECK ("via" IN ('entra', 'break_glass'));
