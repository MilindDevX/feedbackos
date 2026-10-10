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
      create: jest.fn().mockResolvedValue({ id: 'feedback-1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'feedback-1', organizationId: 'org-1', classification: null }),
      update: jest.fn().mockResolvedValue({ id: 'feedback-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    classification: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    reviewAction: { create: jest.fn().mockResolvedValue({ id: 'review-1' }) },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
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
import { publishClassification } from '@/lib/classification/publish'
import { db } from '@/lib/db'

jest.mock('@/lib/classification/publish', () => ({
  publishClassification: jest.fn().mockResolvedValue('queue-message-123'),
}))

// Dynamically import after mocking
let feedbackPost: (req: NextRequest) => Promise<Response>
let feedbackPatch: (req: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>
let dashboardSummaryGet: (req: NextRequest) => Promise<Response>

beforeAll(async () => {
  ;(db.$transaction as jest.Mock).mockImplementation(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db))
  feedbackPost = (await import('@/app/api/feedback/route')).POST
  feedbackPatch = (await import('@/app/api/feedback/[id]/route')).PATCH
  dashboardSummaryGet = (await import('@/app/api/dashboard/summary/route')).GET
})

describe('PATCH /api/feedback/:id – reclassification', () => {
  it('publishes an ID-only reclassification message', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { id: 'user-1', organizationId: 'org-1', role: 'ADMIN' },
    })

    const res = await feedbackPatch(
      makeRequest('PATCH', 'http://localhost/api/feedback/feedback-1', { action: 'RECLASSIFIED' }),
      { params: Promise.resolve({ id: 'feedback-1' }) }
    )

    expect(res.status).toBe(200)
    expect(publishClassification).toHaveBeenCalledWith(
      { feedbackItemId: 'feedback-1', organizationId: 'org-1' }, 0, expect.any(Number)
    )
    expect(db.feedbackItem.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', classificationAttempts: 0 }),
    }))
  })

  it('forbids a viewer from starting reclassification', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { id: 'viewer-1', organizationId: 'org-1', role: 'VIEWER' },
    })
    jest.mocked(publishClassification).mockClear()

    const res = await feedbackPatch(
      makeRequest('PATCH', 'http://localhost/api/feedback/feedback-1', { action: 'RECLASSIFIED' }),
      { params: Promise.resolve({ id: 'feedback-1' }) }
    )

    expect(res.status).toBe(403)
    expect(publishClassification).not.toHaveBeenCalled()
  })

  it('keeps reclassification pending if the queue publish fails', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({
      user: { id: 'user-1', organizationId: 'org-1', role: 'ADMIN' },
    })
    jest.mocked(publishClassification).mockRejectedValueOnce(new Error('queue unavailable'))

    const res = await feedbackPatch(
      makeRequest('PATCH', 'http://localhost/api/feedback/feedback-1', { action: 'RECLASSIFIED' }),
      { params: Promise.resolve({ id: 'feedback-1' }) }
    )

    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ id: 'feedback-1', status: 'PENDING' })
  })
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
    expect(publishClassification).toHaveBeenCalledWith({
      feedbackItemId: 'feedback-1', organizationId: 'org-1',
    })
  })

  it('returns a truthful pending item when queue publishing fails', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { id: 'user-1', organizationId: 'org-1' } })
    jest.mocked(publishClassification).mockRejectedValueOnce(new Error('queue unavailable'))

    const res = await feedbackPost(makeRequest('POST', 'http://localhost/api/feedback', {
      raw_text: 'Dashboard search does not find older feedback.',
    }))

    expect(res.status).toBe(202)
    expect((await res.json()).data).toMatchObject({ id: 'feedback-1', status: 'pending' })
  })
})

// ─── Test: Dashboard summary Redis caching ────────────────────────────────────
describe('GET /api/dashboard/summary – caching', () => {
  const sessionMock = { user: { id: 'user-1', organizationId: 'org-1' } }
  const cachedData = {
    total: 42, needsReview: 5, negativePercent: 20,
    byTheme: { BUG_PROBLEM: 10 }, bySentiment: { NEGATIVE: 8 },
    byProductArea: {}, topProductAreas: [], byStatus: {}, topTheme: 'BUG_PROBLEM',
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
