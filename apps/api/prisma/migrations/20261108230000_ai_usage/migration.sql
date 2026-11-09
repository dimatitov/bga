-- SWR-005B: AI usage accounting (hand-written, CREATE only; existing tables are not touched).
-- One row per AI decision attempt, incl. mock (cost 0) and budget refusals. Cost is integer micro-USD (Q-15).
-- Never stores prompt or response text. No down migration: roll back = restore a DB copy.
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER,
    "estimatedCostMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "pricingVersion" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AiUsage_budgetKey_createdAt_idx" ON "AiUsage"("budgetKey", "createdAt");
