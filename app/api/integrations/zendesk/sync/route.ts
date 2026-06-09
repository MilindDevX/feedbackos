import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getZendeskQueue } from '@/lib/queue'
import { successResponse, unauthorized, notFound, serverError, forbidden } from '@/lib/api-response'
import type { SessionUser } from '@/auth'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return forbidden()
  if (!['OWNER', 'ADMIN', 'MEMBER'].includes(user.role || '')) return forbidden()

  try {
    const source = await db.ingestionSource.findFirst({
      where: { organizationId: user.organizationId, type: 'ZENDESK', isActive: true },
    })

    if (!source) return notFound('Zendesk integration')

    const queue = getZendeskQueue()
    const job = await queue.add(
      `zendesk-sync-${user.organizationId}`,
      { organizationId: user.organizationId, ingestionSourceId: source.id },
      { priority: 2, jobId: `zendesk-sync-${user.organizationId}-${Date.now()}` }
    )

    return successResponse({ jobId: job.id, message: 'Zendesk sync started' }, undefined, 202)
  } catch (err) {
    console.error('[POST /api/integrations/zendesk/sync]', err)
    return serverError()
  }
}
