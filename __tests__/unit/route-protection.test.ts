/**
 * UNIT TEST: request limits and webhook authentication.
 * - Per-account limits answer 429 once the window's budget is spent and fail open if Redis is down.
 * - The Intercom webhook refuses every request when its signing secret is missing.
 */
jest.mock('@/lib/redis', () => ({ redis: { incr: jest.fn(), expire: jest.fn() } }))
jest.mock('@/lib/db', () => ({ db: { ingestionSource: { findFirst: jest.fn() } } }))

import { NextRequest } from 'next/server'
import { redis } from '@/lib/redis'
import { rateLimitBy } from '@/lib/rate-limit'
import { POST as intercomWebhook } from '@/app/api/webhooks/intercom/route'

beforeEach(() => jest.clearAllMocks())

describe('rateLimitBy', () => {
  it('allows requests up to the limit, then answers 429 with Retry-After', async () => {
    jest.mocked(redis.incr).mockResolvedValueOnce(10 as never).mockResolvedValueOnce(11 as never)

    expect(await rateLimitBy('export', 'user-1', 10, 3600)).toBeNull()
    const limited = await rateLimitBy('export', 'user-1', 10, 3600)

    expect(limited?.status).toBe(429)
    expect(limited?.headers.get('Retry-After')).toBe('3600')
    expect(jest.mocked(redis.incr).mock.calls[0][0]).toBe('rl:export:user-1')
  })

  it('starts the window on the first request', async () => {
    jest.mocked(redis.incr).mockResolvedValueOnce(1 as never)
    await rateLimitBy('export', 'user-2', 10, 3600)
    expect(redis.expire).toHaveBeenCalledWith('rl:export:user-2', 3600)
  })

  it('does not lock users out when Redis is unreachable', async () => {
    jest.mocked(redis.incr).mockRejectedValueOnce(new Error('down'))
    expect(await rateLimitBy('export', 'user-3', 10, 3600)).toBeNull()
  })
})

describe('Intercom webhook authentication', () => {
  const original = process.env.INTERCOM_WEBHOOK_SECRET
  afterEach(() => { process.env.INTERCOM_WEBHOOK_SECRET = original })

  const post = (headers: Record<string, string> = {}) => intercomWebhook(new NextRequest('http://localhost/api/webhooks/intercom', {
    method: 'POST', body: JSON.stringify({ topic: 'conversation.user.created' }), headers,
  }))

  it('refuses all requests when no signing secret is configured', async () => {
    delete process.env.INTERCOM_WEBHOOK_SECRET
    jest.mocked(redis.incr).mockResolvedValue(1 as never)
    expect((await post()).status).toBe(503)
  })

  it('rejects a request with a wrong signature', async () => {
    process.env.INTERCOM_WEBHOOK_SECRET = 'secret'
    jest.mocked(redis.incr).mockResolvedValue(1 as never)
    expect((await post({ 'X-Hub-Signature-256': 'sha256=bad' })).status).toBe(401)
  })
})
