ALTER TABLE "ClassificationBudget" ADD COLUMN "dayTokens" INTEGER NOT NULL DEFAULT 0;

-- Existing reservations were not tracked daily. Conservatively exhaust today's
-- token allowance when any request has already been reserved; UTC reset clears it.
UPDATE "ClassificationBudget" SET "dayTokens" = 200000 WHERE "dayRequests" > 0;
