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
      create: jest.fn().mockResolvedValue({ id: 'fb-1' }),
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
    setex: jest.fn().mockResolvedValue('OK'),
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

  it('reuses one cache key for repeated default-window requests', async () => {
    ;(auth as jest.Mock).mockResolvedValue(sessionMock)
    ;(redis.get as jest.Mock).mockResolvedValue(null)
    ;(redis.setex as jest.Mock).mockClear()

    await dashboardSummaryGet(makeRequest('GET', 'http://localhost/api/dashboard/summary'))
    await new Promise((resolve) => setTimeout(resolve, 5))
    await dashboardSummaryGet(makeRequest('GET', 'http://localhost/api/dashboard/summary'))

    const keys = (redis.setex as jest.Mock).mock.calls.map((call) => call[0])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('reports negative share of classified feedback and the window it covers', async () => {
    const { db } = await import('@/lib/db')
    ;(auth as jest.Mock).mockResolvedValue(sessionMock)
    ;(redis.get as jest.Mock).mockResolvedValue(null)
    ;(db.feedbackItem.count as jest.Mock).mockResolvedValueOnce(10).mockResolvedValueOnce(3)
    ;(db.classification.findMany as jest.Mock).mockResolvedValueOnce([
      { theme: 'BUG', sentiment: 'NEGATIVE', productArea: 'API' },
      { theme: 'BUG', sentiment: 'NEGATIVE', productArea: null },
      { theme: 'PRAISE', sentiment: 'POSITIVE', productArea: null },
      { theme: 'OTHER', sentiment: 'NEUTRAL', productArea: null },
    ])

    const res = await dashboardSummaryGet(makeRequest('GET', 'http://localhost/api/dashboard/summary'))
    const json = await res.json()

    expect(json.data.total).toBe(10)
    expect(json.data.negativePercent).toBe(50)
    expect(json.data.windowDays).toBe(30)
  })

  it('returns 401 for unauthenticated requests', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce(null)

    const req = makeRequest('GET', 'http://localhost/api/dashboard/summary')
    const res = await dashboardSummaryGet(req)
    expect(res.status).toBe(401)
  })
})
