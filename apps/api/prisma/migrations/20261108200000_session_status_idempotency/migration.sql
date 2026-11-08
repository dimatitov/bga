-- SWR-004: platform columns only (hand-written, data-preserving: no table rebuild).
-- No game knowledge here: the JSON in `setup` / `state` is NOT rewritten (lazy upcast in the game module, Q-16).
-- Existing rows get status 'prototype' (the only status of the mock scenario). No down migration:
-- roll back = restore a DB copy.
ALTER TABLE "Session" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'prototype';
ALTER TABLE "Session" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Session" ADD COLUMN "idempotencyHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_idempotencyKey_key" ON "Session"("idempotencyKey");
