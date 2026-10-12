import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { publishClassification } from '@/lib/classification/publish'
import { rateLimit, rateLimitBy } from '@/lib/rate-limit'
import { itemsIngestedToday, workspaceDailyItemLimit } from '@/lib/abuse-limits'
import { invalidateDashboard } from '@/lib/dashboard-cache'
import { classificationFilter, submittedAtFilter } from '@/lib/feedback-filters'
import { successResponse, errorResponse, unauthorized, validationError, serverError } from '@/lib/api-response'
import { SourceType, FeedbackStatus, Theme, Sentiment, Prisma } from '@prisma/client'
import type { SessionUser } from '@/auth'

// ─── GET /api/feedback — Paginated list with filters ─────────────────────────
const listQuerySchema = z.object({
  cursor: z.string().optional(),          // cursor-based pagination (preferred)
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  status: z.nativeEnum(FeedbackStatus).optional(),
  theme: z.nativeEnum(Theme).optional(),
  sentiment: z.nativeEnum(Sentiment).optional(),
  source: z.nativeEnum(SourceType).optional(),
  productArea: z.string().optional(),
  dateFrom: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid dateFrom').optional(),
  dateTo: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid dateTo').optional(),
  search: z.string().max(200).optional(), // bounded to prevent large payloads
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return errorResponse('No organization', 'NO_ORG', 400)
  const limited = await rateLimitBy('feedback-list', user.id, 120)
  if (limited) return limited

  const url = new URL(req.url)
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return validationError(parsed.error.issues[0].message)

  const { cursor, page, pageSize, status, theme, sentiment, source, productArea, dateFrom, dateTo, search } = parsed.data

  const where: Prisma.FeedbackItemWhereInput = {
    organizationId: user.organizationId,
    ...(status && { status }),
    ...(source && { source }),
    classification: classificationFilter({ theme, sentiment, productArea }),
    submittedAt: submittedAtFilter(dateFrom, dateTo),
    ...(search && { rawText: { contains: search, mode: 'insensitive' } }),
  }

  // ── Cursor-based pagination for large datasets (avoids OFFSET degradation) ──
  if (cursor) {
    const [items, total] = await Promise.all([
      db.feedbackItem.findMany({
        where,
        take: pageSize,
        skip: 1,              // skip the cursor record
        cursor: { id: cursor },
        orderBy: { submittedAt: 'desc' },
        // ⚠️ AUDIT FIX: Select only needed columns — rawText can be large
        select: {
          id: true,
          source: true,
          status: true,
          submittedAt: true,
          ingestedAt: true,
          submitterEmail: true,
          submitterName: true,
          externalId: true,
          // rawText intentionally NOT selected in list view
          classification: {
            select: {
              theme: true,
              secondaryThemes: true,
              sentiment: true,
              productArea: true,
              confidenceScore: true,
              summary: true,
              requiresHumanReview: true,
              classifiedAt: true,
            },
          },
          feedbackTags: { select: { tag: { select: { id: true, name: true, color: true } } } },
        },
      }),
      db.feedbackItem.count({ where }),
    ])

    const nextCursor = items.length === pageSize ? items[items.length - 1]?.id : null
    return successResponse(items, { cursor: nextCursor, total, pageSize })
  }

  // ── Offset pagination fallback (kept for small page numbers / compatibility) ──
  const skip = (page - 1) * pageSize
  const [items, total] = await Promise.all([
    db.feedbackItem.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        source: true,
        status: true,
        submittedAt: true,
        ingestedAt: true,
        submitterEmail: true,
        submitterName: true,
        externalId: true,
        classification: {
          select: {
            theme: true,
            secondaryThemes: true,
            sentiment: true,
            productArea: true,
            confidenceScore: true,
            summary: true,
            requiresHumanReview: true,
            classifiedAt: true,
          },
        },
        feedbackTags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    db.feedbackItem.count({ where }),
  ])

  return successResponse(items, {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  })
}

// ─── POST /api/feedback — Ingest single item ──────────────────────────────────
const ingestSchema = z.object({
  source: z.string().default('manual'),
  raw_text: z.string().min(1).max(50000),
  submitted_at: z.string().optional(),
  submitter_email: z.string().email().optional(),
  submitter_name: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  // ── AUDIT FIX: Rate limit — 30 ingest requests per minute per IP ──
  const rateLimited = await rateLimit(req, 'feedback-ingest', 30)
  if (rateLimited) return rateLimited

  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return errorResponse('No organization', 'NO_ORG', 400)
  const userLimited = await rateLimitBy('feedback-ingest-user', user.id, 30)
  if (userLimited) return userLimited

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return validationError('Invalid JSON body')
  }

  const parsed = ingestSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.issues[0].message)

  const { source, raw_text, submitted_at, submitter_email, submitter_name, metadata } = parsed.data

  const sourceEnum: SourceType = (['ZENDESK', 'INTERCOM', 'CSV', 'MANUAL', 'API'].includes(source.toUpperCase()))
    ? (source.toUpperCase() as SourceType)
    : 'MANUAL'

  // Every workspace shares one AI quota; a daily share stops one workspace from starving the rest.
  const dailyLimit = workspaceDailyItemLimit()
  if (await itemsIngestedToday(user.organizationId) >= dailyLimit) {
    return errorResponse(`This workspace has reached its limit of ${dailyLimit} new feedback items today. Try again tomorrow.`, 'DAILY_LIMIT', 429)
  }

  try {
    const item = await db.feedbackItem.create({
      data: {
        organizationId: user.organizationId,
        source: sourceEnum,
        rawText: raw_text,
        submittedAt: submitted_at ? new Date(submitted_at) : new Date(),
        submitterEmail: submitter_email,
        submitterName: submitter_name,
        status: 'PENDING',
        classificationDispatchKind: 'INTERACTIVE',
        metadata: (metadata || {}) as Record<string, string>,
      },
    })

    await invalidateDashboard(user.organizationId)
    try {
      const jobId = await publishClassification({ feedbackItemId: item.id, organizationId: user.organizationId })
      return successResponse({ id: item.id, status: 'queued', jobId }, undefined, 202)
    } catch {
      console.warn('[POST /api/feedback] Classification publish failed; item remains pending')
      return successResponse({ id: item.id, status: 'pending' }, undefined, 202)
    }
  } catch (err) {
    console.error('[POST /api/feedback]', err)
    return serverError()
  }
}
