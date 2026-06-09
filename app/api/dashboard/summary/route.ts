import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { successResponse, unauthorized, serverError } from '@/lib/api-response'
import type { SessionUser } from '@/auth'

const CACHE_TTL = 300 // 5 minutes

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return successResponse(getEmptySummary())

  const url = new URL(req.url)
  const dateFrom = url.searchParams.get('dateFrom') || getDefaultDateFrom()
  const dateTo = url.searchParams.get('dateTo') || new Date().toISOString()

  const cacheKey = `dashboard:summary:${user.organizationId}:${dateFrom}:${dateTo}`

  try {
    // Check cache
    const cached = await redis.get(cacheKey).catch(() => null)
    if (cached) {
      return successResponse(JSON.parse(cached), { cached: true })
    }

    const orgId = user.organizationId
    const dateFilter = {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    }

    const [total, byStatus, classifications, needsReview] = await Promise.all([
      db.feedbackItem.count({ where: { organizationId: orgId, submittedAt: dateFilter } }),
      db.feedbackItem.groupBy({
        by: ['status'],
        where: { organizationId: orgId, submittedAt: dateFilter },
        _count: { id: true },
      }),
      db.classification.findMany({
        where: {
          feedbackItem: { organizationId: orgId, submittedAt: dateFilter },
        },
        select: { theme: true, sentiment: true, productArea: true },
      }),
      db.feedbackItem.count({
        where: { organizationId: orgId, status: 'NEEDS_REVIEW' },
      }),
    ])

    const byTheme: Record<string, number> = {}
    const bySentiment: Record<string, number> = {}
    const byProductArea: Record<string, number> = {}

    for (const c of classifications) {
      byTheme[c.theme] = (byTheme[c.theme] || 0) + 1
      bySentiment[c.sentiment] = (bySentiment[c.sentiment] || 0) + 1
      if (c.productArea) {
        byProductArea[c.productArea] = (byProductArea[c.productArea] || 0) + 1
      }
    }

    const topProductAreas = Object.entries(byProductArea)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    const negativeSentiment = bySentiment['NEGATIVE'] || 0
    const negativePercent = total > 0 ? Math.round((negativeSentiment / total) * 100) : 0

    const statusMap: Record<string, number> = {}
    for (const s of byStatus) statusMap[s.status] = s._count.id

    const summary = {
      total,
      needsReview,
      negativePercent,
      byTheme,
      bySentiment,
      byProductArea,
      topProductAreas,
      byStatus: statusMap,
      topTheme: Object.entries(byTheme).sort(([, a], [, b]) => b - a)[0]?.[0] || null,
    }

    // Cache result
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(summary)).catch(() => null)

    return successResponse(summary)
  } catch (err) {
    console.error('[GET /api/dashboard/summary]', err)
    return serverError()
  }
}

function getDefaultDateFrom(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString()
}

function getEmptySummary() {
  return {
    total: 0, needsReview: 0, negativePercent: 0,
    byTheme: {}, bySentiment: {}, byProductArea: {},
    topProductAreas: [], byStatus: {}, topTheme: null,
  }
}
