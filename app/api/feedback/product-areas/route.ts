// ABOUTME: Product areas that actually appear in this workspace's classified feedback, most common first.
// ABOUTME: Feeds the inbox's product-area filter, so it only offers choices that return results.
import { auth, type SessionUser } from '@/auth'
import { db } from '@/lib/db'
import { rateLimitBy } from '@/lib/rate-limit'
import { successResponse, unauthorized, serverError } from '@/lib/api-response'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return successResponse([])
  const limited = await rateLimitBy('product-areas', user.id, 60)
  if (limited) return limited

  try {
    const groups = await db.classification.groupBy({
      by: ['productArea'],
      where: { feedbackItem: { organizationId: user.organizationId }, productArea: { not: null } },
      _count: { _all: true },
    })
    const areas = groups
      .filter((group): group is typeof group & { productArea: string } => Boolean(group.productArea))
      .sort((a, b) => b._count._all - a._count._all)
      .map((group) => ({ name: group.productArea, count: group._count._all }))
    return successResponse(areas)
  } catch (err) {
    console.error('[GET /api/feedback/product-areas]', err)
    return serverError()
  }
}
