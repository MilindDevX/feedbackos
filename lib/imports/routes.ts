// ABOUTME: Session-scoped logic behind the CSV import endpoints: start, Blob upload authorization,
// ABOUTME: signed completion, and per-import status. Route files stay thin wrappers.
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { completeCsvImport, MAX_CSV_BYTES, refreshCsvImportState, type CsvImportDeps } from './csv'

type ImportUser = { id: string; organizationId?: string | null } | null
type Result = { status: number; body: Record<string, unknown> }

const column = z.string().trim().min(1).max(100)
const StartSchema = z.object({
  columnMapping: z.object({
    rawText: column,
    submittedAt: column.optional(),
    submitterEmail: column.optional(),
    externalId: column.optional(),
  }).strict(),
}).strict()
const TokenPayloadSchema = z.object({ importId: z.string().min(1) }).strict()
const STALE_UPLOAD_MS = 15 * 60_000

export async function startCsvImport(user: ImportUser, body: unknown): Promise<Result> {
  if (!user?.id) return { status: 401, body: { error: 'Unauthorized' } }
  if (!user.organizationId) return { status: 400, body: { error: 'No organization', code: 'NO_ORG' } }
  const parsed = StartSchema.safeParse(body)
  if (!parsed.success) return { status: 400, body: { error: 'Choose the column that holds the feedback text.' } }

  // An upload that never completed (closed tab, dropped connection) must not lock the workspace until the daily cron.
  await db.csvImport.updateMany({
    where: { organizationId: user.organizationId, state: 'UPLOADING', createdAt: { lt: new Date(Date.now() - STALE_UPLOAD_MS) } },
    data: { state: 'FAILED', lastError: 'The upload was not completed.' },
  })
  const pathname = `imports/${user.organizationId}/${randomUUID()}.csv`
  try {
    const created = await db.csvImport.create({ data: {
      organizationId: user.organizationId,
      uploaderId: user.id,
      state: 'UPLOADING',
      blobPathname: pathname,
      columnMapping: parsed.data.columnMapping,
    } })
    return { status: 201, body: { importId: created.id, pathname } }
  } catch (error) {
    // The partial unique index allows one live import per organization.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { status: 409, body: { error: 'Another CSV import is still in progress for this workspace.' } }
    }
    throw error
  }
}

export async function authorizeCsvUpload(user: ImportUser, pathname: string, clientPayload: string | null) {
  if (!user?.id || !user.organizationId) throw new Error('Unauthorized')
  const payload = TokenPayloadSchema.safeParse(JSON.parse(clientPayload ?? 'null'))
  if (!payload.success) throw new Error('Missing import reference')
  const csvImport = await db.csvImport.findFirst({ where: { id: payload.data.importId, organizationId: user.organizationId } })
  if (!csvImport || csvImport.state !== 'UPLOADING' || csvImport.blobPathname !== pathname) {
    throw new Error('Upload not allowed for this import')
  }
  return {
    allowedContentTypes: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
    maximumSizeInBytes: MAX_CSV_BYTES,
    addRandomSuffix: false,
    allowOverwrite: false,
    tokenPayload: JSON.stringify({ importId: csvImport.id }),
  }
}

export async function completeAuthorizedCsvUpload(
  blob: { pathname: string },
  tokenPayload: string | null | undefined,
  deps: CsvImportDeps & { blobSize: (pathname: string) => Promise<number> }
): Promise<void> {
  let importId: string
  try {
    importId = TokenPayloadSchema.parse(JSON.parse(tokenPayload ?? 'null')).importId
  } catch {
    return
  }
  // Size comes from storage, not from the caller.
  await completeCsvImport(importId, { pathname: blob.pathname, size: await deps.blobSize(blob.pathname) }, deps)
}

export async function getCsvImportStatus(user: ImportUser, importId: string): Promise<Result> {
  if (!user?.id) return { status: 401, body: { error: 'Unauthorized' } }
  if (!user.organizationId) return { status: 404, body: { error: 'Import not found' } }
  await refreshCsvImportState(importId)
  const csvImport = await db.csvImport.findFirst({ where: { id: importId, organizationId: user.organizationId } })
  if (!csvImport) return { status: 404, body: { error: 'Import not found' } }
  const groups = await db.feedbackItem.groupBy({ by: ['status'], where: { csvImportId: importId }, _count: { _all: true } })
  const count = (...statuses: string[]) => groups
    .filter((group) => statuses.includes(group.status))
    .reduce((total, group) => total + group._count._all, 0)
  return { status: 200, body: {
    id: csvImport.id,
    state: csvImport.state,
    totalRows: csvImport.totalRows,
    importedRows: csvImport.importedRows,
    invalidRows: csvImport.invalidRows,
    lastError: csvImport.lastError,
    createdAt: csvImport.createdAt,
    completedAt: csvImport.completedAt,
    queued: count('PENDING', 'CLASSIFYING'),
    classified: count('CLASSIFIED', 'REVIEWED'),
    needsReview: count('NEEDS_REVIEW'),
    failed: count('CLASSIFICATION_ERROR'),
  } }
}

// The browser cancels its own import when the direct upload fails, so the user can retry immediately.
export async function cancelCsvImport(user: ImportUser, importId: string): Promise<Result> {
  if (!user?.id || !user.organizationId) return { status: 401, body: { error: 'Unauthorized' } }
  const cancelled = await db.csvImport.updateMany({
    where: { id: importId, organizationId: user.organizationId, state: 'UPLOADING' },
    data: { state: 'FAILED', lastError: 'The upload was cancelled.' },
  })
  if (cancelled.count !== 1) return { status: 409, body: { error: 'This import can no longer be cancelled.' } }
  return { status: 200, body: { cancelled: true } }
}
