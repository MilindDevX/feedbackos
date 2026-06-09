import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

/**
 * Production rate limiter using Redis sliding window.
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
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  const redisKey = `rl:${key}:${ip}`

  try {
    const current = await redis.incr(redisKey)
    if (current === 1) {
      await redis.expire(redisKey, windowSecs)
    }

    if (current > limit) {
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

    return null
  } catch {
    // If Redis is down, fail open (don't block legitimate users)
    return null
  }
}
