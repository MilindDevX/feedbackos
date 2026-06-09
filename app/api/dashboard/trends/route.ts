import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { successResponse, unauthorized, serverError } from '@/lib/api-response'
import { Theme } from '@prisma/client'
import type { SessionUser } from '@/auth'
import { startOfWeek, subWeeks, format } from 'date-fns'

const CACHE_TTL = 900 // 15 minutes

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return successResponse({ weeks: [], themes: [] })

  const cacheKey = `dashboard:trends:${user.organizationId}`

  try {
    const cached = await redis.get(cacheKey).catch(() => null)
    if (cached) return successResponse(JSON.parse(cached), { cached: true })

    const orgId = user.organizationId
    const now = new Date()
    const twelveWeeksAgo = subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 12)

    // Get all classifications in the last 12 weeks
    const items = await db.feedbackItem.findMany({
      where: {
        organizationId: orgId,
        submittedAt: { gte: twelveWeeksAgo },
        status: { in: ['CLASSIFIED', 'REVIEWED', 'NEEDS_REVIEW'] },
      },
      include: { classification: { select: { theme: true } } },
      orderBy: { submittedAt: 'asc' },
    })

    // Build week buckets
    const weekMap: Record<string, Record<string, number>> = {}
    const weeks: string[] = []
    for (let i = 11; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 })
      const key = format(weekStart, 'MMM d')
      weeks.push(key)
      weekMap[key] = {}
    }

    // Count items per week per theme
    for (const item of items) {
      if (!item.classification) continue
      const weekStart = startOfWeek(item.submittedAt, { weekStartsOn: 1 })
      const key = format(weekStart, 'MMM d')
      if (!weekMap[key]) continue
      const theme = item.classification.theme
      weekMap[key][theme] = (weekMap[key][theme] || 0) + 1
    }

    // Find top 3 themes by total volume
    const themeTotals: Record<string, number> = {}
    for (const weekData of Object.values(weekMap)) {
      for (const [theme, count] of Object.entries(weekData)) {
        themeTotals[theme] = (themeTotals[theme] || 0) + count
      }
    }
    const topThemes = (Object.keys(themeTotals) as Theme[])
      .sort((a, b) => (themeTotals[b] || 0) - (themeTotals[a] || 0))
      .slice(0, 3)

    // Build chart-ready data: array of { week, [theme]: count }
    const chartData = weeks.map((week) => {
      const row: Record<string, number | string> = { week }
      for (const theme of Object.values(Theme)) {
        row[theme] = weekMap[week]?.[theme] || 0
      }
      return row
    })

    const result = { weeks, topThemes, chartData, themeTotals }

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)).catch(() => null)

    return successResponse(result)
  } catch (err) {
    console.error('[GET /api/dashboard/trends]', err)
    return serverError()
  }
}
