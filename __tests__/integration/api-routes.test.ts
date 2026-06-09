/**
 * INTEGRATION TEST: POST /api/feedback (ingest) returns 401 when no session present
 * INTEGRATION TEST: GET /api/dashboard/summary returns cached response on 2nd call within TTL
 */

import { NextRequest } from 'next/server'

// ── Mock auth so we can control session in tests ──────────────────────────────
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/db', () => ({
  db: {
    feedbackItem: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    classification: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn(),
  },
}))

jest.mock('@/lib/redis', () => ({
  redis: {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
    get: jest.fn(),
    setex: jest.fn(),
    ping: jest.fn(),
  },
}))

jest.mock('@/lib/queue', () => ({
  getClassifyQueue: jest.fn(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  })),
}))

import { auth } from '@/auth'
import { redis } from '@/lib/redis'

// Dynamically import after mocking
let feedbackPost: (req: NextRequest) => Promise<Response>
let dashboardSummaryGet: (req: NextRequest) => Promise<Response>

beforeAll(async () => {
  feedbackPost = (await import('@/app/api/feedback/route')).POST
  dashboardSummaryGet = (await import('@/app/api/dashboard/summary/route')).GET
})

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

// ─── Test: Unauthenticated ingest returns 401 ─────────────────────────────────
describe('POST /api/feedback – authentication', () => {
  it('returns 401 when no session is present', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(null)

    const req = makeRequest('POST', 'http://localhost/api/feedback', {
      raw_text: 'The export button is broken',
    })

    const res = await feedbackPost(req)
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.code).toBe('UNAUTHORIZED')
  })

  it('returns 202 when session is valid and body is correct', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { id: 'user-1', organizationId: 'org-1' },
    })

    const req = makeRequest('POST', 'http://localhost/api/feedback', {
      raw_text: 'The export button is broken',
    })

    const res = await feedbackPost(req)
    expect(res.status).toBe(202)
  })
})

// ─── Test: Dashboard summary Redis caching ────────────────────────────────────
describe('GET /api/dashboard/summary – caching', () => {
  const sessionMock = { user: { id: 'user-1', organizationId: 'org-1' } }
  const cachedData = {
    total: 42, needsReview: 5, negativePercent: 20,
    byTheme: { BUG: 10 }, bySentiment: { NEGATIVE: 8 },
    byProductArea: {}, topProductAreas: [], byStatus: {}, topTheme: 'BUG',
  }

  it('returns cached response on 2nd call within TTL (redis.get returns data)', async () => {
    ;(auth as jest.Mock).mockResolvedValue(sessionMock)
    ;(redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(cachedData))

    const req = makeRequest('GET', 'http://localhost/api/dashboard/summary')
    const res = await dashboardSummaryGet(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.meta?.cached).toBe(true)
    expect(json.data.total).toBe(42)
  })

  it('queries PostgreSQL and sets cache on cache miss', async () => {
    ;(auth as jest.Mock).mockResolvedValue(sessionMock)
    ;(redis.get as jest.Mock).mockResolvedValueOnce(null) // cache miss

    const req = makeRequest('GET', 'http://localhost/api/dashboard/summary')
    const res = await dashboardSummaryGet(req)

    expect(res.status).toBe(200)
    expect(redis.setex).toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated requests', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(null)

    const req = makeRequest('GET', 'http://localhost/api/dashboard/summary')
    const res = await dashboardSummaryGet(req)
    expect(res.status).toBe(401)
  })
})
