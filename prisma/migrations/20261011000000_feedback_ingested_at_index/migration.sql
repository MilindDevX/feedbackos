-- Supports the per-workspace daily feedback limit (count of items ingested since UTC midnight).
CREATE INDEX "feedback_items_organizationId_ingestedAt_idx" ON "feedback_items"("organizationId", "ingestedAt");
