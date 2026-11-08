-- SWR-003: Game → Session, GameEvent → SessionEvent (hand-written, data-preserving).
-- Prisma would generate DROP + CREATE (data loss); this redefines the tables and copies every row.
-- Existing sessions are SWR-002 Star Wars: Rebellion plays → gameId = 'star-wars-rebellion' (AC-7).
-- The JSON in `state` is not rewritten (Q-24). There is no down migration: roll back = restore a DB copy.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "setup" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Copy data (backfill gameId)
INSERT INTO "Session" ("id", "gameId", "setup", "state", "version", "createdAt", "updatedAt")
SELECT "id", 'star-wars-rebellion', "setup", "state", "version", "createdAt", "updatedAt" FROM "Game";

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy data
INSERT INTO "SessionEvent" ("id", "sessionId", "seq", "type", "actor", "payload", "createdAt")
SELECT "id", "gameId", "seq", "type", "actor", "payload", "createdAt" FROM "GameEvent";

-- DropTable
DROP TABLE "GameEvent";

-- DropTable
DROP TABLE "Game";

-- CreateIndex
CREATE INDEX "Session_gameId_updatedAt_idx" ON "Session"("gameId", "updatedAt");

-- CreateIndex
CREATE INDEX "Session_updatedAt_idx" ON "Session"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionEvent_sessionId_seq_key" ON "SessionEvent"("sessionId", "seq");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
