ALTER TABLE "feedback_items"
  ADD COLUMN "classificationLeaseToken" TEXT,
  ADD COLUMN "classificationLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "classificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "classificationNextAttemptAt" TIMESTAMP(3);

CREATE INDEX "feedback_items_classification_dispatch_idx"
  ON "feedback_items"("status", "classificationNextAttemptAt", "classificationLeaseUntil");
