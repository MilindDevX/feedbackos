import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { dashboardCacheKey } from '@/lib/dashboard-cache'
import { successResponse, unauthorized, serverError } from '@/lib/api-response'
import type { SessionUser } from '@/auth'

const CACHE_TTL = 300 // 5 minutes
const DEFAULT_WINDOW_DAYS = 30

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return successResponse(getEmptySummary())

  const url = new URL(req.url)
  const requestedFrom = url.searchParams.get('dateFrom')
  const requestedTo = url.searchParams.get('dateTo')
  const dateFrom = requestedFrom || getDefaultDateFrom()
  const dateTo = requestedTo || new Date().toISOString()

  // The default window moves every millisecond; key it by name so repeat loads share one cache entry.
  const cacheKey = await dashboardCacheKey(user.organizationId, `summary:${requestedFrom ?? `last${DEFAULT_WINDOW_DAYS}d`}:${requestedTo ?? 'now'}`)

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
        select: { theme: true, secondaryThemes: true, sentiment: true, productArea: true },
      }),
      db.feedbackItem.count({
        where: { organizationId: orgId, status: 'NEEDS_REVIEW' },
      }),
    ])

    const byTheme: Record<string, number> = {}
    const bySentiment: Record<string, number> = {}
    const byProductArea: Record<string, number> = {}

    // Themes count every item that mentions them, so praise inside a complaint is not lost.
    for (const c of classifications) {
      for (const theme of new Set([c.theme, ...c.secondaryThemes])) byTheme[theme] = (byTheme[theme] || 0) + 1
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
    const classifiedCount = classifications.length
    const negativePercent = classifiedCount > 0 ? Math.round((negativeSentiment / classifiedCount) * 100) : 0

    const statusMap: Record<string, number> = {}
    for (const s of byStatus) statusMap[s.status] = s._count.id

    const summary = {
      total,
      windowDays: requestedFrom || requestedTo ? null : DEFAULT_WINDOW_DAYS,
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
  d.setDate(d.getDate() - DEFAULT_WINDOW_DAYS)
  return d.toISOString()
}

function getEmptySummary() {
  return {
    total: 0, windowDays: DEFAULT_WINDOW_DAYS, needsReview: 0, negativePercent: 0,
    byTheme: {}, bySentiment: {}, byProductArea: {},
    topProductAreas: [], byStatus: {}, topTheme: null,
  }
}
