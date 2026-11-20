-- SWR-008 (AC-12, plan-backend §5): rules-context accounting columns of AiUsage (hand-written, data-preserving:
-- ADD COLUMN only, no table rebuild; the generated RedefineTables variant was replaced). Existing rows get the
-- "rules off" defaults; promptTokensUpperBound stays NULL for rows written before SWR-008.
-- Rule ids only (public KB ids as a JSON array) — never rule text, prompt text or the model's reason.
-- No down migration: roll back = restore a DB copy.
ALTER TABLE "AiUsage" ADD COLUMN "rulesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiUsage" ADD COLUMN "rulesVersion" TEXT;
ALTER TABLE "AiUsage" ADD COLUMN "rulesCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsage" ADD COLUMN "rulesIds" TEXT;
ALTER TABLE "AiUsage" ADD COLUMN "rulesChars" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsage" ADD COLUMN "rulesTokensEstimate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsage" ADD COLUMN "rulesTruncated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiUsage" ADD COLUMN "rulesDropped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiUsage" ADD COLUMN "promptTokensUpperBound" INTEGER;
