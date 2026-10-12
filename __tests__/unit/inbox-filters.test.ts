/**
 * UNIT TEST: inbox filters.
 * - "Last N days" is computed on the server clock.
 * - The product-area filter offers only areas present in the workspace, most common first.
 */
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn().mockResolvedValue(null), rateLimitBy: jest.fn().mockResolvedValue(null) }))
jest.mock('@/lib/db', () => ({
  db: {
    feedbackItem: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    classification: { groupBy: jest.fn() },
  },
}))

import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { GET as listFeedback } from '@/app/api/feedback/route'
import { GET as listProductAreas } from '@/app/api/feedback/product-areas/route'

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(auth as unknown as jest.Mock).mockResolvedValue({ user: { id: 'user-1', organizationId: 'org-1', role: 'MEMBER' } })
})

it('turns withinDays into a submittedAt lower bound', async () => {
  const before = Date.now()
  await listFeedback(new NextRequest('http://localhost/api/feedback?withinDays=7'))

  const where = jest.mocked(db.feedbackItem.findMany).mock.calls[0][0]!.where as { submittedAt: { gte: Date } }
  const ageDays = (before - where.submittedAt.gte.getTime()) / 86_400_000
  expect(ageDays).toBeGreaterThan(6.99)
  expect(ageDays).toBeLessThan(7.01)
})

it('rejects an out-of-range period', async () => {
  expect((await listFeedback(new NextRequest('http://localhost/api/feedback?withinDays=9999'))).status).toBe(422)
})

it('lists the workspace product areas by frequency, skipping empty ones', async () => {
  jest.mocked(db.classification.groupBy).mockResolvedValueOnce([
    { productArea: 'API', _count: { _all: 2 } },
    { productArea: null, _count: { _all: 9 } },
    { productArea: 'Billing', _count: { _all: 5 } },
  ] as never)

  const json = await (await listProductAreas()).json()

  expect(json.data).toEqual([{ name: 'Billing', count: 5 }, { name: 'API', count: 2 }])
  expect(jest.mocked(db.classification.groupBy).mock.calls[0][0]).toMatchObject({ where: { feedbackItem: { organizationId: 'org-1' } } })
})
