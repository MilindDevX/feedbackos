import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { successResponse, unauthorized, serverError } from '@/lib/api-response'
import type { SessionUser } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return successResponse({ pending: 0, classifying: 0, total: 0 })

  try {
    const [pending, classifying, needsReview, total] = await Promise.all([
      db.feedbackItem.count({ where: { organizationId: user.organizationId, status: 'PENDING' } }),
      db.feedbackItem.count({ where: { organizationId: user.organizationId, status: 'CLASSIFYING' } }),
      db.feedbackItem.count({ where: { organizationId: user.organizationId, status: 'NEEDS_REVIEW' } }),
      db.feedbackItem.count({ where: { organizationId: user.organizationId } }),
    ])

    return successResponse({ pending, classifying, needsReview, total })
  } catch (err) {
    console.error('[GET /api/feedback/queue-status]', err)
    return serverError()
  }
}
