CREATE TABLE "ClassificationBudget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "minuteWindowStart" TIMESTAMP(3) NOT NULL,
  "minuteRequests" INTEGER NOT NULL DEFAULT 0,
  "minuteTokens" INTEGER NOT NULL DEFAULT 0,
  "dayWindowStart" TIMESTAMP(3) NOT NULL,
  "dayRequests" INTEGER NOT NULL DEFAULT 0,
  "nextAllowedAt" TIMESTAMP(3) NOT NULL
);
