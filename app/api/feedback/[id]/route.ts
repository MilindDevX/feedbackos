import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getClassifyQueue } from '@/lib/queue'
import { successResponse, unauthorized, notFound, serverError, validationError, forbidden } from '@/lib/api-response'
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
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return validationError('Invalid JSON') }

  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.issues[0].message)

  const { action, theme, sentiment, note } = parsed.data

  if (action === 'OVERRIDDEN' && (!theme || !sentiment)) {
    return validationError('theme and sentiment are required for OVERRIDDEN action')
  }

  try {
    const item = await db.feedbackItem.findUnique({
      where: { id },
      include: { classification: true },
    })

    if (!item || item.organizationId !== user.organizationId) return notFound('Feedback item')
    if (!['VIEWER'].includes(user.role || '')) {
      // Allow all roles to review
    }

    if (action === 'RECLASSIFIED') {
      await db.feedbackItem.update({ where: { id }, data: { status: 'PENDING' } })
      const queue = getClassifyQueue()
      await queue.add(`reclassify-${id}`, { feedbackItemId: id, organizationId: user.organizationId }, { priority: 1 })
    } else {
      const updates: Record<string, unknown> = { status: 'REVIEWED' }

      if (action === 'OVERRIDDEN' && item.classification) {
        await db.classification.update({
          where: { feedbackId: id },
          data: {
            ...(theme && { theme }),
            ...(sentiment && { sentiment }),
          },
        })
      }

      await db.feedbackItem.update({ where: { id }, data: updates })
    }

    await db.reviewAction.create({
      data: {
        feedbackId: id,
        reviewerId: session.user.id,
        action,
        previousTheme: item.classification?.theme,
        newTheme: theme || item.classification?.theme,
        previousSentiment: item.classification?.sentiment,
        newSentiment: sentiment || item.classification?.sentiment,
        note,
      },
    })

    return successResponse({ id, action, status: action === 'RECLASSIFIED' ? 'PENDING' : 'REVIEWED' })
  } catch (err) {
    console.error('[PATCH /api/feedback/:id]', err)
    return serverError()
  }
}
