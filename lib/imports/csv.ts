// ABOUTME: Completes a private-Blob CSV import into FeedbackItems and hands rows to the serverless classifier.
// ABOUTME: Validation precedes writes; state transitions and row inserts are idempotent across retries.
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { CsvFormatError, CsvLimitError, validateCsv, type CsvColumnMapping } from '@/lib/integrations/csv'
import { publishClassification } from '@/lib/classification/publish'
import { itemsIngestedToday, workspaceDailyItemLimit } from '@/lib/abuse-limits'
import { invalidateDashboard } from '@/lib/dashboard-cache'

export const MAX_CSV_BYTES = 20 * 1024 * 1024
// Bulk rows are spaced at twice the provider pace (12 s) so manual feedback keeps capacity.
export const BULK_SLOT_SECONDS = 24
const INSERT_BATCH = 500

export interface CsvImportDeps {
  readBlob: (pathname: string) => Promise<string>
  deleteBlob: (pathname: string) => Promise<void>
  publish?: typeof publishClassification
}

async function failImport(importId: string, pathname: string, message: string, deps: CsvImportDeps) {
  await db.csvImport.updateMany({
    where: { id: importId, state: { in: ['UPLOADING', 'IMPORTING'] } },
    data: { state: 'FAILED', lastError: message },
  })
  await deps.deleteBlob(pathname).catch(() => undefined) // cron retries cleanup of expired objects
}

export async function completeCsvImport(
  importId: string,
  blob: { pathname: string; size: number },
  deps: CsvImportDeps
): Promise<void> {
  const csvImport = await db.csvImport.findUnique({ where: { id: importId } })
  if (!csvImport) return
  // Authority comes from the server-created record, never from a caller-supplied path.
  if (blob.pathname !== csvImport.blobPathname) throw new Error('Uploaded file does not belong to this import')
  if (csvImport.state !== 'UPLOADING' && csvImport.state !== 'IMPORTING') return // duplicate callback

  if (blob.size > MAX_CSV_BYTES) {
    return failImport(importId, blob.pathname, 'The CSV exceeds the 20 MiB limit.', deps)
  }
  await db.csvImport.updateMany({
    where: { id: importId, state: 'UPLOADING' },
    data: { state: 'IMPORTING', uploadedAt: new Date(), byteSize: blob.size },
  })

  let validated
  try {
    validated = validateCsv(await deps.readBlob(blob.pathname), csvImport.columnMapping as unknown as CsvColumnMapping)
  } catch (error) {
    if (error instanceof CsvLimitError || error instanceof CsvFormatError) {
      return failImport(importId, blob.pathname, error.message, deps)
    }
    throw error
  }

  // Counts today's other feedback, not this import's own rows, so a resumed import is not rejected by itself.
  const dailyLimit = workspaceDailyItemLimit()
  const ingestedToday = await itemsIngestedToday(csvImport.organizationId, new Date(), importId)
  if (ingestedToday + validated.rows.length > dailyLimit) {
    const remaining = Math.max(0, dailyLimit - ingestedToday)
    return failImport(importId, blob.pathname,
      `This file has ${validated.rows.length.toLocaleString('en-US')} valid rows, but this workspace can add only ${remaining.toLocaleString('en-US')} more feedback items today (daily limit ${dailyLimit.toLocaleString('en-US')}).`, deps)
  }

  for (let start = 0; start < validated.rows.length; start += INSERT_BATCH) {
    const batch: Prisma.FeedbackItemCreateManyInput[] = validated.rows.slice(start, start + INSERT_BATCH).map((row) => ({
      organizationId: csvImport.organizationId,
      source: 'CSV',
      rawText: row.rawText,
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : new Date(),
      submitterEmail: row.submitterEmail,
      externalId: row.externalId,
      status: 'PENDING',
      classificationDispatchKind: 'BULK',
      csvImportId: importId,
      csvRowNumber: row.rowNumber,
    }))
    // Row numbers are unique per import, so a retry after a crash skips rows already written.
    await db.feedbackItem.createMany({ data: batch, skipDuplicates: true })
  }

  const importedRows = await db.feedbackItem.count({ where: { csvImportId: importId } })
  const moved = await db.csvImport.updateMany({
    where: { id: importId, state: 'IMPORTING' },
    data: { state: 'PROCESSING', totalRows: validated.totalRows, importedRows, invalidRows: validated.errors.length },
  })
  if (moved.count !== 1) return // another callback finished first
  await invalidateDashboard(csvImport.organizationId)

  try {
    await deps.deleteBlob(blob.pathname)
  } catch {
    await db.csvImport.update({ where: { id: importId }, data: { lastError: 'Uploaded file cleanup pending' } })
  }

  // Staggered ID-only messages; the per-item idempotency key makes a repeated hand-off harmless.
  // Anything not published stays PENDING in the database for drain/cron recovery.
  const publish = deps.publish ?? publishClassification
  const pending = await db.feedbackItem.findMany({
    where: { csvImportId: importId, status: 'PENDING' },
    select: { id: true },
    orderBy: { csvRowNumber: 'asc' },
  })
  // Parallel chunks keep a 2,000-row hand-off well inside the callback's time limit.
  for (let start = 0; start < pending.length; start += 50) {
    await Promise.all(pending.slice(start, start + 50).map((item, offset) =>
      publish({ feedbackItemId: item.id, organizationId: csvImport.organizationId }, (start + offset) * BULK_SLOT_SECONDS, 'csv')
        .catch(() => undefined)))
  }
}

// Closes an import once none of its rows await classification, which frees the one-live-import slot.
export async function refreshCsvImportState(importId: string): Promise<void> {
  const unfinished = await db.feedbackItem.count({
    where: { csvImportId: importId, status: { in: ['PENDING', 'CLASSIFYING'] } },
  })
  if (unfinished > 0) return
  await db.csvImport.updateMany({
    where: { id: importId, state: 'PROCESSING' },
    data: { state: 'COMPLETED', completedAt: new Date() },
  })
}

const ABANDONED_UPLOAD_MS = 60 * 60_000
const STUCK_IMPORT_MS = 15 * 60_000

// Daily cron repair: fail uploads that never completed, resume imports whose callback died mid-way
// (the blob is only deleted after a durable import), and close imports whose rows are all finished.
export async function repairCsvImports(
  now: Date,
  deps: CsvImportDeps & { blobSize: (pathname: string) => Promise<number> }
): Promise<void> {
  const abandoned = await db.csvImport.findMany({
    where: { state: 'UPLOADING', createdAt: { lt: new Date(now.getTime() - ABANDONED_UPLOAD_MS) } },
    select: { id: true, blobPathname: true },
    take: 100,
  })
  for (const csvImport of abandoned) {
    await failImport(csvImport.id, csvImport.blobPathname, 'The upload was not completed.', deps)
  }

  const stuck = await db.csvImport.findMany({
    where: { state: 'IMPORTING', updatedAt: { lt: new Date(now.getTime() - STUCK_IMPORT_MS) } },
    select: { id: true, blobPathname: true },
    take: 10,
  })
  for (const csvImport of stuck) {
    try {
      await completeCsvImport(csvImport.id, { pathname: csvImport.blobPathname, size: await deps.blobSize(csvImport.blobPathname) }, deps)
    } catch {
      // Leave it for the next run; one failure must not block the others.
    }
  }

  const processing = await db.csvImport.findMany({ where: { state: 'PROCESSING' }, select: { id: true }, take: 100 })
  for (const csvImport of processing) await refreshCsvImportState(csvImport.id)
}
