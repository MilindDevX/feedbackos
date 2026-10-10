CREATE TYPE "ClassificationDispatchKind" AS ENUM ('INTERACTIVE', 'BULK');
ALTER TABLE "feedback_items" ADD COLUMN "classificationDispatchKind" "ClassificationDispatchKind";

-- Preserve recovery for previously submitted manual/API work. Integrations/CSV
-- remain on their existing path unless explicitly requested by a new producer.
UPDATE "feedback_items"
SET "classificationDispatchKind" = 'INTERACTIVE'
WHERE "source" IN ('MANUAL', 'API') AND "status" IN ('PENDING', 'CLASSIFYING');
