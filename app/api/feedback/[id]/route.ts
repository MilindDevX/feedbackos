import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { publishClassification } from '@/lib/classification/publish'
import { invalidateDashboard } from '@/lib/dashboard-cache'
import { hitRateLimit } from '@/lib/rate-limit'
import { successResponse, errorResponse, unauthorized, notFound, serverError, validationError, forbidden } from '@/lib/api-response'
import { Theme, Sentiment } from '@prisma/client'
import type { SessionUser } from '@/auth'

// ─── GET /api/feedback/:id ────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return forbidden()
  const { id } = await params

  try {
    const item = await db.feedbackItem.findUnique({
      where: { id },
      include: {
        classification: true,
        feedbackTags: { include: { tag: true } },
        reviewActions: { include: { reviewer: { select: { name: true, email: true, image: true } } }, orderBy: { reviewedAt: 'desc' } },
        classificationLog: true,
      },
    })

    if (!item || item.organizationId !== user.organizationId) return notFound('Feedback item')

    return successResponse(item)
  } catch (err) {
    console.error('[GET /api/feedback/:id]', err)
    return serverError()
  }
}

// ─── PATCH /api/feedback/:id/review — Review action ──────────────────────────
const reviewSchema = z.object({
  action: z.enum(['ACCEPTED', 'OVERRIDDEN', 'RECLASSIFIED']),
  theme: z.nativeEnum(Theme).optional(),
  sentiment: z.nativeEnum(Sentiment).optional(),
  note: z.string().max(1000).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return forbidden()
  if (user.role === 'VIEWER') return forbidden()
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return validationError('Invalid JSON') }

  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.issues[0].message)

  const { action, theme, sentiment, note } = parsed.data

  if (action === 'OVERRIDDEN' && (!theme || !sentiment)) {
    return validationError('theme and sentiment are required for OVERRIDDEN action')
  }

  // Each re-classification spends the shared AI quota, so repeated clicks or scripts are capped per workspace.
  if (action === 'RECLASSIFIED' && await hitRateLimit(`reclassify:${user.organizationId}`, 60, 3600)) {
    return errorResponse('Too many re-classifications this hour. Try again later.', 'RATE_LIMITED', 429)
  }

  try {
    const item = await db.feedbackItem.findUnique({
      where: { id },
      include: { classification: true },
    })

    if (!item || item.organizationId !== user.organizationId) return notFound('Feedback item')

    await db.$transaction(async (tx) => {
      // Lock/invalidate the item before touching its classification, matching
      // the consumer's write order so a human decision wins atomically.
      await tx.feedbackItem.update({
        where: { id, organizationId: user.organizationId },
        data: action === 'RECLASSIFIED' ? {
          status: 'PENDING',
          classificationDispatchKind: 'INTERACTIVE',
          classificationAttempts: 0,
          classificationLeaseToken: null,
          classificationLeaseUntil: null,
          classificationNextAttemptAt: null,
        } : {
          status: 'REVIEWED',
          classificationLeaseToken: null,
          classificationLeaseUntil: null,
          classificationNextAttemptAt: null,
        },
      })
      const previous = await tx.classification.findUnique({ where: { feedbackId: id } })
      if (action === 'OVERRIDDEN' && previous) {
        await tx.classification.update({
          where: { feedbackId: id },
          data: {
            ...(theme && { theme }),
            ...(sentiment && { sentiment }),
          },
        })
      }

      await tx.reviewAction.create({
        data: {
          feedbackId: id,
          reviewerId: user.id,
          action,
          previousTheme: previous?.theme,
          newTheme: theme || previous?.theme,
          previousSentiment: previous?.sentiment,
          newSentiment: sentiment || previous?.sentiment,
          note,
        },
      })
    })
    await invalidateDashboard(user.organizationId)
    if (action === 'RECLASSIFIED') {
      try {
        await publishClassification({ feedbackItemId: id, organizationId: user.organizationId }, 0, Date.now())
      } catch {
        console.warn('[PATCH /api/feedback/:id] Classification publish failed; item remains pending')
      }
    }

    return successResponse({ id, action, status: action === 'RECLASSIFIED' ? 'PENDING' : 'REVIEWED' })
  } catch (err) {
    console.error('[PATCH /api/feedback/:id]', err)
    return serverError()
  }
}
