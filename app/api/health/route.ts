import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { rateLimit } from '@/lib/rate-limit'

/**
 * GET /api/health
 * Returns 200 with service status if healthy, 503 if any dependency is down.
 * Used by Railway/Render health checks and uptime monitoring.
 */
export async function GET(req: NextRequest) {
  // Public, but each call touches the database and Redis; uptime monitors need far less than this.
  const limited = await rateLimit(req, 'health', 60)
  if (limited) return limited
  const checks: Record<string, 'ok' | 'error'> = {}

  // ── Check PostgreSQL ──
  try {
    await db.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  // ── Check Redis ──
  try {
    await redis.ping()
    checks.redis = 'ok'
  } catch {
    checks.redis = 'error'
  }

  const allHealthy = Object.values(checks).every((v) => v === 'ok')
  const status = allHealthy ? 200 : 503

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status }
  )
}
