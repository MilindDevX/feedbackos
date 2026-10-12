import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Fixed-window counter in Redis. Returns true when this hit exceeds `limit`.
 * Fails open (returns false) when Redis is unreachable so legitimate users are not blocked.
 */
export async function hitRateLimit(bucket: string, limit: number, windowSecs: number): Promise<boolean> {
  const redisKey = `rl:${bucket}`
  try {
    const current = await redis.incr(redisKey)
    if (current === 1) await redis.expire(redisKey, windowSecs)
    return current > limit
  } catch {
    return false
  }
}

/**
 * Per-IP rate limit for a route.
 * @param req  - Incoming request (for IP extraction)
 * @param key  - Unique identifier for the rate-limit bucket (e.g. route name)
 * @param limit - Max requests in the window
 * @param windowSecs - Window size in seconds
 * @returns NextResponse 429 if limit exceeded, null otherwise
 */
export async function rateLimit(
  req: NextRequest,
  key: string,
  limit: number,
  windowSecs: number = 60
): Promise<NextResponse | null> {
  if (!(await hitRateLimit(`${key}:${clientIp(req)}`, limit, windowSecs))) return null
  return NextResponse.json(
    { error: 'Too many requests', code: 'RATE_LIMITED' },
    {
      status: 429,
      headers: {
        'Retry-After': String(windowSecs),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}

/**
 * Per-user (or per-workspace) rate limit for signed-in routes; IP limits are easy to dodge by rotating addresses,
 * an account is not. Returns a 429 response when over the limit, null otherwise.
 */
export async function rateLimitBy(
  bucket: string,
  id: string,
  limit: number,
  windowSecs: number = 60
): Promise<NextResponse | null> {
  if (!(await hitRateLimit(`${bucket}:${id}`, limit, windowSecs))) return null
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.', code: 'RATE_LIMITED' },
    { status: 429, headers: { 'Retry-After': String(windowSecs), 'X-RateLimit-Limit': String(limit), 'X-RateLimit-Remaining': '0' } }
  )
}
