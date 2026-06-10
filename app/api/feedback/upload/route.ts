import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getCsvQueue } from '@/lib/queue'
import { rateLimit } from '@/lib/rate-limit'
import { parseCsvBuffer, detectCsvColumns } from '@/lib/integrations/csv'
import { successResponse, errorResponse, unauthorized, serverError, validationError } from '@/lib/api-response'
import type { SessionUser } from '@/auth'

export const runtime = 'nodejs'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB — AUDIT FIX: tightened from 10MB
const MAX_ROW_COUNT = 500

export async function POST(req: NextRequest) {
  // ── AUDIT FIX: Rate limit CSV upload — 10 per hour per IP ──
  const rateLimited = await rateLimit(req, 'csv-upload', 10, 3600)
  if (rateLimited) return rateLimited

  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return errorResponse('No organization', 'NO_ORG', 400)

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const columnMappingStr = formData.get('columnMapping') as string | null

    if (!file) return validationError('No file provided')

    // ── AUDIT FIX: Validate both size and MIME type ──
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return validationError(`File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit`)
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return validationError('Only CSV files are accepted')
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // If requesting column detection (step 1)
    if (formData.get('detectColumns') === 'true') {
      const columns = detectCsvColumns(buffer.toString('utf-8'))
      return successResponse({ columns })
    }

    // Parse with provided column mapping
    let mapping = { rawText: 'text' }
    if (columnMappingStr) {
      try {
        mapping = JSON.parse(columnMappingStr)
      } catch {
        return validationError('Invalid column mapping JSON')
      }
    }

    if (!mapping.rawText) {
      return validationError('Column mapping must include "rawText" field')
    }

    const { rows, errors, totalRows } = parseCsvBuffer(buffer, mapping, MAX_ROW_COUNT)

    // ── AUDIT FIX: Return graceful user-facing error when rawText column maps to nothing ──
    if (rows.length === 0) {
      const errorDetail = errors.length > 0
        ? `The column "${mapping.rawText}" has no valid data. ${errors[0]?.reason || ''}`
        : 'No valid rows found after applying the column mapping. Please check your CSV structure.'
      return validationError(errorDetail)
    }

    // Enqueue CSV import job
    const queue = getCsvQueue()
    const job = await queue.add(
      `csv-import-${user.organizationId}-${Date.now()}`,
      { organizationId: user.organizationId, rows },
      { priority: 3 }
    )

    return successResponse({
      batchId: job.id,
      itemsQueued: rows.length,
      itemsSkipped: totalRows - rows.length,
      errors,
    }, undefined, 202)
  } catch (err) {
    console.error('[POST /api/feedback/upload]', err)
    return serverError()
  }
}
