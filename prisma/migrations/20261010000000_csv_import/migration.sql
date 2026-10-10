-- CreateEnum
CREATE TYPE "CsvImportState" AS ENUM ('UPLOADING', 'IMPORTING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "feedback_items" ADD COLUMN     "csvImportId" TEXT,
ADD COLUMN     "csvRowNumber" INTEGER;

-- CreateTable
CREATE TABLE "CsvImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "state" "CsvImportState" NOT NULL DEFAULT 'UPLOADING',
    "blobPathname" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "byteSize" INTEGER,
    "totalRows" INTEGER,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CsvImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CsvImport_blobPathname_key" ON "CsvImport"("blobPathname");

-- CreateIndex
CREATE INDEX "CsvImport_organizationId_createdAt_idx" ON "CsvImport"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CsvImport_state_updatedAt_idx" ON "CsvImport"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_items_csvImportId_csvRowNumber_key" ON "feedback_items"("csvImportId", "csvRowNumber");

-- AddForeignKey
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_csvImportId_fkey" FOREIGN KEY ("csvImportId") REFERENCES "CsvImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImport" ADD CONSTRAINT "CsvImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImport" ADD CONSTRAINT "CsvImport_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One live import per organization; terminal imports (COMPLETED, FAILED) do not block a new start.
CREATE UNIQUE INDEX "csv_import_one_live_per_org"
ON "CsvImport" ("organizationId")
WHERE "state" IN ('UPLOADING', 'IMPORTING', 'PROCESSING');
